import { z } from 'zod';
import { assertIslandWrite, canWriteIsland, hasRole, requireRole } from '../auth.js';
import { forbidden } from '../errors.js';
import { id, idParam, one, optText, parse, text, updateSet } from '../http.js';
import { projectVisible } from './projects.js';

const atollBody = z.object({ code: text(10), name: text(100), active: z.boolean().optional() });
const islandBody = z.object({
  atoll_id: id,
  name: text(100),
  population: z.number().int().nonnegative().nullish(),
  notes: optText(),
  active: z.boolean().optional(),
});

// Per-island rollup used by the atoll and island lists.
// Counts only the projects the user may see (see projectVisible).
const islandSummary = (vis) => `
  select i.id, i.name, i.population, i.notes, i.active, a.id as atoll_id, a.code as atoll_code, a.name as atoll_name,
         count(distinct f.id) filter (where f.active) as facility_count,
         coalesce(array_agg(distinct f.service::text) filter (where f.active), '{}') as services,
         count(s.id) filter (where s.kind = 'genset' and s.status <> 'decommissioned') as genset_count,
         count(s.id) filter (where s.status = 'running') as running_count,
         count(s.id) filter (where s.status in ('down', 'maintenance')) as down_count,
         count(s.id) filter (where s.kind = 'genset' and s.status = 'unknown') as no_report_count,
         coalesce(sum(s.rated_capacity) filter (where s.kind = 'genset' and s.status <> 'decommissioned'), 0) as installed_kw,
         (select count(*) from incidents x where x.island_id = i.id and x.status = 'open') as open_incidents,
         (select count(*) from projects p where p.island_id = i.id and p.status in ('planned', 'ongoing', 'on_hold') and ${vis.sql}) as active_projects,
         (select sum(fc.fuel_capacity_l) from facilities fc
           where fc.island_id = i.id and fc.active and fc.service = 'electricity') as fuel_capacity_l
    from islands i
    join atolls a on a.id = i.atoll_id
    left join facilities f on f.island_id = i.id
    left join assets s on s.facility_id = f.id and s.active and f.active`;

export default async function locationRoutes(app) {
  const { db } = app;

  // --- Atolls ---------------------------------------------------------------
  app.get('/atolls', async () => {
    const { rows } = await db.query(`
      select a.*, count(i.id) filter (where i.active) as island_count
        from atolls a left join islands i on i.atoll_id = a.id
       group by a.id order by a.code`);
    return rows;
  });

  app.post('/atolls', { preHandler: requireRole('admin') }, async (req, reply) => {
    const body = parse(atollBody, req.body);
    const row = await db.tx(req.user.id, async (t) => one((await t.query(
      'insert into atolls (code, name, active) values ($1, $2, coalesce($3, true)) returning *',
      [body.code, body.name, body.active ?? null])).rows));
    reply.code(201);
    return row;
  });

  app.patch('/atolls/:id', { preHandler: requireRole('admin') }, async (req) => {
    const { id: atollId } = parse(idParam, req.params);
    const set = updateSet(parse(atollBody.partial(), req.body), ['code', 'name', 'active']);
    return db.tx(req.user.id, async (t) => one((await t.query(
      `update atolls set ${set.sql} where id = $1 returning *`, [atollId, ...set.values])).rows, 'Atoll'));
  });

  // --- Islands --------------------------------------------------------------
  app.get('/islands', async (req) => {
    const q = parse(z.object({
      atoll_id: id.optional(),
      q: z.string().max(100).optional(),
      include_inactive: z.coerce.boolean().optional(),
    }), req.query);
    const vis = projectVisible(req.user, 1);
    const where = ['true'];
    const values = [...vis.values];
    if (!q.include_inactive) where.push('i.active');
    if (q.atoll_id) { values.push(q.atoll_id); where.push(`i.atoll_id = $${values.length}`); }
    if (q.q) { values.push(`%${q.q}%`); where.push(`i.name ilike $${values.length}`); }
    const { rows } = await db.query(
      `${islandSummary(vis)} where ${where.join(' and ')} group by i.id, a.id order by a.code, i.name`, values);
    return rows;
  });

  app.get('/islands/:id', async (req) => {
    const { id: islandId } = parse(idParam, req.params);
    const vis = projectVisible(req.user, 2);
    const island = one((await db.query(`${islandSummary(vis)} where i.id = $1 group by i.id, a.id`, [islandId, ...vis.values])).rows, 'Island');
    const [{ rows: facilities }, { rows: assets }] = await Promise.all([
      db.query(`select f.* from facilities f where f.island_id = $1 order by f.active desc, f.service, f.name`, [islandId]),
      db.query(`select s.*, u.full_name as status_by_name,
                       c.report_month, c.condition, c.report_condition, c.condition_source, c.condition_note, c.condition_at, c.status_text as report_status, c.fault, c.total_hours,
                       c.hours_since_overhaul, c.needs_overhaul, c.alt_needs_service,
                       greatest(c.last_overhaul_on, (select max(done_on) from maintenance_events e
                                where e.asset_id = s.id and e.kind in ('overhaul', 'top_overhaul'))) as last_overhaul_on,
                       greatest(c.last_alt_service_on, (select max(done_on) from maintenance_events e
                                where e.asset_id = s.id and e.kind = 'alternator_service')) as last_alt_service_on,
                       (select json_agg(json_build_object('id', w.id, 'title', w.title, 'status', w.status))
                          from work_orders w where w.asset_id = s.id and w.status not in ('completed', 'cancelled')) as open_work
                  from assets s join facilities f on f.id = s.facility_id
                  left join users u on u.id = s.status_by
                  left join engine_current c on c.asset_id = s.id
                 where f.island_id = $1
                 order by s.kind, length(s.tag), s.tag`, [islandId]),
    ]);
    const [{ rows: reports }, { rows: work }, { rows: movedAway }] = await Promise.all([
      db.query(`select r.*, u.full_name as uploaded_by_name from powerhouse_reports r
                  join facilities f on f.id = r.facility_id left join users u on u.id = r.uploaded_by
                 where f.island_id = $1`, [islandId]),
      db.query(`select w.id, 'WO-' || lpad(w.id::text, 4, '0') as ref, w.kind, w.title, w.status, w.target_on, w.started_on,
                       s.tag as asset_tag, s.kind as asset_kind,
                       lu.body as last_update, lu.created_at as last_update_at, lu.by_name as last_update_by
                  from work_orders w left join assets s on s.id = w.asset_id
                  left join lateral (select u.body, u.created_at, uu.full_name as by_name from work_updates u
                                       left join users uu on uu.id = u.created_by
                                      where u.work_id = w.id order by u.created_at desc limit 1) lu on true
                 where w.island_id = $1 and w.status not in ('completed', 'cancelled')
                 order by w.created_at desc`, [islandId]),
      // Assets that left this island's facilities: shown as events where
      // they were, the record itself lives on where they went.
      db.query(`select m.id, m.asset_id, m.from_facility_id, m.from_tag, m.to_tag, m.moved_on, m.source, s.kind,
                       ti.id as to_island_id, ti.name as to_island, ta.code as to_atoll, tf.name as to_facility
                  from asset_moves m join assets s on s.id = m.asset_id
                  join facilities ff on ff.id = m.from_facility_id
                  left join facilities tf on tf.id = m.to_facility_id left join islands ti on ti.id = tf.island_id
                  left join atolls ta on ta.id = ti.atoll_id
                 where ff.island_id = $1 and tf.island_id is distinct from $1
                 order by m.moved_on desc limit 50`, [islandId]),
    ]);
    for (const s of assets) if (typeof s.open_work === 'string') s.open_work = JSON.parse(s.open_work);
    island.open_work = work;
    island.can_edit = hasRole(req.user, 'manager') && canWriteIsland(req.user, island);
    // Plants, assets and condition reports are technical information.
    island.technical = req.user.technical;
    if (!req.user.technical) {
      island.reports = [];
      island.facilities = [];
      return island;
    }
    island.reports = reports;
    for (const f of facilities) {
      f.assets = assets.filter((s) => s.facility_id === f.id);
      f.moved_away = movedAway.filter((m) => m.from_facility_id === f.id);
    }
    island.facilities = facilities;
    return island;
  });

  app.post('/islands', { preHandler: requireRole('admin') }, async (req, reply) => {
    const body = parse(islandBody, req.body);
    const row = await db.tx(req.user.id, async (t) => one((await t.query(
      `insert into islands (atoll_id, name, population, notes, active)
       values ($1, $2, $3, $4, coalesce($5, true)) returning *`,
      [body.atoll_id, body.name, body.population ?? null, body.notes, body.active ?? null])).rows));
    reply.code(201);
    return row;
  });

  app.patch('/islands/:id', { preHandler: requireRole('manager') }, async (req) => {
    const { id: islandId } = parse(idParam, req.params);
    const body = parse(islandBody.partial(), req.body);
    // Renaming, moving or retiring an island changes the register: admin only.
    if ((body.atoll_id || body.name || body.active !== undefined) && req.user.role !== 'admin') {
      throw forbidden('Only an administrator can rename, move or deactivate an island');
    }
    await assertIslandWrite(db, req.user, { islandId });
    const set = updateSet(body, ['atoll_id', 'name', 'population', 'notes', 'active']);
    return db.tx(req.user.id, async (t) => one((await t.query(
      `update islands set ${set.sql} where id = $1 returning *`, [islandId, ...set.values])).rows, 'Island'));
  });
}

