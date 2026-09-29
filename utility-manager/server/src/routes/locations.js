import { z } from 'zod';
import { assertIslandWrite, canWriteIsland, hasRole, requireRole } from '../auth.js';
import { forbidden } from '../errors.js';
import { id, idParam, one, optText, parse, text, updateSet } from '../http.js';

const atollBody = z.object({ code: text(10), name: text(100), active: z.boolean().optional() });
const islandBody = z.object({
  atoll_id: id,
  name: text(100),
  population: z.number().int().nonnegative().nullish(),
  notes: optText(),
  active: z.boolean().optional(),
});

// Per-island rollup used by the atoll and island lists.
const ISLAND_SUMMARY = `
  select i.id, i.name, i.population, i.notes, i.active, a.id as atoll_id, a.code as atoll_code, a.name as atoll_name,
         count(distinct f.id) filter (where f.active) as facility_count,
         coalesce(array_agg(distinct f.service::text) filter (where f.active), '{}') as services,
         count(s.id) filter (where s.kind = 'genset') as genset_count,
         count(s.id) filter (where s.status = 'running') as running_count,
         count(s.id) filter (where s.status in ('down', 'maintenance')) as down_count,
         coalesce(sum(s.rated_capacity) filter (where s.kind = 'genset'), 0) as installed_kw,
         (select count(*) from incidents x where x.island_id = i.id and x.status = 'open') as open_incidents,
         (select count(*) from projects p where p.island_id = i.id and p.status in ('planned', 'ongoing', 'on_hold')) as active_projects,
         (select sum(fc.fuel_capacity_l) from facilities fc
           where fc.island_id = i.id and fc.active and fc.service = 'electricity') as fuel_capacity_l,
         fs.value as fuel_stock_l, fs.reading_date as fuel_stock_date
    from islands i
    left join lateral (
      select sum(r.value) as value, r.reading_date
        from readings r join facilities fr on fr.id = r.facility_id
       where fr.island_id = i.id and fr.active and r.metric = 'fuel_stock_l'
       group by r.reading_date order by r.reading_date desc limit 1
    ) fs on true
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
    const where = ['true'];
    const values = [];
    if (!q.include_inactive) where.push('i.active');
    if (q.atoll_id) { values.push(q.atoll_id); where.push(`i.atoll_id = $${values.length}`); }
    if (q.q) { values.push(`%${q.q}%`); where.push(`i.name ilike $${values.length}`); }
    const { rows } = await db.query(
      `${ISLAND_SUMMARY} where ${where.join(' and ')} group by i.id, a.id, fs.value, fs.reading_date order by a.code, i.name`, values);
    return rows;
  });

  app.get('/islands/:id', async (req) => {
    const { id: islandId } = parse(idParam, req.params);
    const island = one((await db.query(`${ISLAND_SUMMARY} where i.id = $1 group by i.id, a.id, fs.value, fs.reading_date`, [islandId])).rows, 'Island');
    const [{ rows: facilities }, { rows: assets }] = await Promise.all([
      db.query(`select f.*, (select max(reading_date) from readings r where r.facility_id = f.id) as last_reading_date
                  from facilities f where f.island_id = $1 order by f.active desc, f.service, f.name`, [islandId]),
      db.query(`select s.*, u.full_name as status_by_name
                  from assets s join facilities f on f.id = s.facility_id
                  left join users u on u.id = s.status_by
                 where f.island_id = $1
                 order by s.kind, length(s.tag), s.tag`, [islandId]),
    ]);
    for (const f of facilities) f.assets = assets.filter((s) => s.facility_id === f.id);
    island.facilities = facilities;
    island.can_edit = hasRole(req.user, 'operator') && canWriteIsland(req.user, island);
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

