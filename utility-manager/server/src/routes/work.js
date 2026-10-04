import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { sendCsv } from '../csv.js';
import { badRequest } from '../errors.js';
import { assetName, esc } from '../telegram.js';
import { Where, date, id, one, optText, pageOf, paging, parse, serialParam, service, text, updateSet } from '../http.js';

export const WORK_KINDS = ['overhaul', 'top_overhaul', 'alternator_service', 'repair', 'service', 'inspection', 'installation', 'other'];
export const WORK_STATES = ['planned', 'in_progress', 'awaiting_parts', 'on_hold', 'completed', 'cancelled'];
const OPEN = "w.status not in ('completed', 'cancelled')";

const body = z.object({
  island_id: id.nullish(),
  asset_id: id.nullish(),
  facility_id: id.nullish(),
  service: service.nullish(),          // needed for island-wide work; otherwise taken from the facility / asset
  kind: z.enum(WORK_KINDS),
  title: text(200),
  description: optText(5000),
  status: z.enum(WORK_STATES).default('in_progress'),
  assigned_to: optText(200),
  started_on: date.nullish(),
  target_on: date.nullish(),
  completed_on: date.nullish(),
});
const COLS = ['kind', 'title', 'description', 'status', 'assigned_to', 'started_on', 'target_on', 'completed_on'];

const SELECT = `
  select w.*, 'WO-' || lpad(w.id::text, 4, '0') as ref,
         i.name as island_name, i.atoll_id, a.code as atoll_code, f.name as facility_name,
         s.tag as asset_tag, s.kind as asset_kind, s.make_model as asset_model,
         cu.full_name as created_by_name,
         (w.target_on < current_date and ${OPEN}) as overdue,
         (select u.body from work_updates u where u.work_id = w.id order by u.created_at desc limit 1) as last_update,
         (select max(u.created_at) from work_updates u where u.work_id = w.id) as last_update_at,
         count(*) over () as total_count
    from work_orders w
    join islands i on i.id = w.island_id
    join atolls a on a.id = i.atoll_id
    left join facilities f on f.id = w.facility_id
    left join assets s on s.id = w.asset_id
    left join users cu on cu.id = w.created_by`;

const listQuery = paging.extend({
  status: z.enum(['open', 'all', ...WORK_STATES]).default('open'),
  island_id: id.optional(),
  atoll_id: id.optional(),
  asset_id: id.optional(),
  service: service.optional(),
  kind: z.enum(WORK_KINDS).optional(),
  q: z.string().max(100).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

// Resolves where a piece of work is: from the asset, the facility or the island.
async function locate(db, b) {
  if (b.asset_id) {
    return one((await db.query(`select s.id as asset_id, f.id as facility_id, f.island_id, f.service from assets s
                                  join facilities f on f.id = s.facility_id where s.id = $1`, [b.asset_id])).rows, 'Asset');
  }
  if (b.facility_id) {
    const r = one((await db.query('select id as facility_id, island_id, service from facilities where id = $1', [b.facility_id])).rows, 'Facility');
    return { asset_id: null, ...r };
  }
  if (!b.island_id) throw badRequest('Choose the island, facility or asset the work is on');
  if (!b.service) throw badRequest('Choose whether the work is electricity, water or sewerage');
  return { asset_id: null, facility_id: null, island_id: b.island_id, service: b.service };
}

export default async function workRoutes(app) {
  const { db, telegram } = app;
  const completedAlert = async (workId, user, note) => {
    const w = one((await db.query(`${SELECT} where w.id = $1`, [workId])).rows);
    await telegram.alert(`✅ <b>Work completed: ${esc(w.title)}</b>\n${esc(w.atoll_code)}. ${esc(w.island_name)}${w.asset_tag ? ` · ${esc(assetName({ kind: w.asset_kind, tag: w.asset_tag }))}` : ''}${note ? `\n${esc(note.slice(0, 200))}` : ''}\n<i>${esc(user.fullName)}</i> · ${telegram.link(`/work/${w.id}`, w.ref)}`);
  };
  const manager = { preHandler: requireRole('manager') };

  app.get('/work', async (req, reply) => {
    const q = parse(listQuery, req.query);
    const w = new Where()
      .add('w.island_id = ?', q.island_id).add('i.atoll_id = ?', q.atoll_id).add('w.asset_id = ?', q.asset_id)
      .add('w.kind = ?', q.kind).add('w.service = ?', q.service)
      .add('(w.title ilike ? or w.description ilike ? or i.name ilike ? or w.assigned_to ilike ?)', q.q && `%${q.q}%`);
    if (q.status === 'open') w.raw(OPEN);
    else if (q.status !== 'all') w.add('w.status = ?', q.status);
    const csv = q.format === 'csv';
    const { rows } = await db.query(`${SELECT} ${w.sql}
      order by (${OPEN}) desc,
               array_position(array['in_progress','awaiting_parts','on_hold','planned','completed','cancelled'], w.status),
               w.target_on nulls last, w.id desc
      limit ${csv ? 20000 : q.limit} offset ${csv ? 0 : q.offset}`, w.values);
    if (csv) {
      return sendCsv(reply, 'work.csv', rows, [
        ['Ref', 'ref'], ['Atoll', 'atoll_code'], ['Island', 'island_name'], ['Genset / asset', 'asset_tag'],
        ['Type', 'kind'], ['Title', 'title'], ['Status', 'status'], ['Assigned to', 'assigned_to'],
        ['Started', 'started_on'], ['Target', 'target_on'], ['Completed', 'completed_on'], ['Latest update', 'last_update'],
      ]);
    }
    return pageOf(rows, q);
  });

  app.get('/work/:id', async (req) => {
    const { id: workId } = parse(serialParam, req.params);
    const work = one((await db.query(`${SELECT} where w.id = $1`, [workId])).rows, 'Work');
    delete work.total_count;
    work.updates = (await db.query(`
      select u.*, us.full_name as created_by_name from work_updates u left join users us on us.id = u.created_by
       where u.work_id = $1 order by u.created_at desc`, [workId])).rows;
    return work;
  });

  app.post('/work', manager, async (req, reply) => {
    const b = parse(body, req.body);
    const where = await locate(db, b);
    await assertIslandWrite(db, req.user, { islandId: where.island_id });
    const { rows } = await db.tx(req.user.id, (t) => t.query(`
      insert into work_orders (island_id, facility_id, asset_id, kind, title, description, status, assigned_to,
                               started_on, target_on, completed_on, created_by, service)
      values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, case when $7 in ('in_progress', 'awaiting_parts') then current_date end),
              $10, case when $7 = 'completed' then coalesce($11, current_date) end, $12, $13)
      returning id`,
    [where.island_id, where.facility_id, where.asset_id, b.kind, b.title, b.description, b.status, b.assigned_to,
      b.started_on ?? null, b.target_on ?? null, b.completed_on ?? null, req.user.id, where.service]));
    reply.code(201);
    const row = one((await db.query(`${SELECT} where w.id = $1`, [rows[0].id])).rows);
    delete row.total_count;
    return row;
  });

  app.patch('/work/:id', manager, async (req) => {
    const { id: workId } = parse(serialParam, req.params);
    const patch = parse(body.omit({ island_id: true, asset_id: true, facility_id: true, service: true }).partial(), req.body);
    for (const k of Object.keys(patch)) if (!(k in (req.body || {}))) delete patch[k];
    const current = one((await db.query('select island_id, status, completed_on from work_orders where id = $1', [workId])).rows, 'Work');
    await assertIslandWrite(db, req.user, { islandId: current.island_id });
    if (patch.status === 'completed' && !patch.completed_on) patch.completed_on = current.completed_on || new Date().toISOString().slice(0, 10);
    if (patch.status && !['completed', 'cancelled'].includes(patch.status)) patch.completed_on = null;
    const set = updateSet(patch, COLS);
    await db.tx(req.user.id, (t) => t.query(`update work_orders set ${set.sql} where id = $1`, [workId, ...set.values]));
    const row = one((await db.query(`${SELECT} where w.id = $1`, [workId])).rows);
    delete row.total_count;
    if (patch.status === 'completed' && current.status !== 'completed') await completedAlert(workId, req.user);
    return row;
  });

  app.post('/work/:id/updates', manager, async (req, reply) => {
    const { id: workId } = parse(serialParam, req.params);
    const b = parse(z.object({ body: text(5000), status: z.enum(WORK_STATES).nullish() }), req.body);
    const current = one((await db.query('select island_id, status from work_orders where id = $1', [workId])).rows, 'Work');
    await assertIslandWrite(db, req.user, { islandId: current.island_id });
    const { rows } = await db.tx(req.user.id, (t) => t.query(`
      insert into work_updates (work_id, body, status, created_by) values ($1, $2, $3, $4) returning *`,
    [workId, b.body, b.status ?? null, req.user.id]));
    reply.code(201);
    if (b.status === 'completed' && current.status !== 'completed') await completedAlert(workId, req.user, b.body);
    return rows[0];
  });
}
