import { z } from 'zod';
import { allowed, assertIslandWrite, canWriteIsland, hasRole, requireRole } from '../auth.js';
import { sendCsv } from '../csv.js';
import { badRequest, forbidden } from '../errors.js';
import { assetName, esc } from '../telegram.js';
import { checkMovePlan, moveAsset } from '../assetMoves.js';
import { Where, date, id, one, optText, pageOf, paging, parse, serialParam, service, text, updateSet } from '../http.js';

export const WORK_KINDS = ['overhaul', 'top_overhaul', 'alternator_service', 'repair', 'service', 'inspection', 'installation', 'relocation', 'other'];
// Moving a genset (kind 'relocation') has its own stages instead of
// in progress / awaiting parts.
export const MOVE_STAGES = ['dismantling', 'in_transit', 'installing'];
export const WORK_STATES = ['planned', 'in_progress', 'awaiting_parts', 'on_hold', ...MOVE_STAGES, 'completed', 'cancelled'];
const MOVE_STATES = ['planned', ...MOVE_STAGES, 'on_hold', 'completed', 'cancelled'];
const STAGE_LABEL = { planned: 'Planned', dismantling: 'Dismantling', in_transit: 'In transit', installing: 'Installing',
  on_hold: 'On hold', completed: 'Completed', cancelled: 'Cancelled' };
function checkStatus(kind, status) {
  if (!status) return;
  if (kind === 'relocation' && !MOVE_STATES.includes(status)) throw badRequest(`A move's stages are: ${MOVE_STATES.map((s) => STAGE_LABEL[s]).join(', ')}`);
  if (kind !== 'relocation' && MOVE_STAGES.includes(status)) throw badRequest(`${STAGE_LABEL[status]} is a stage of a genset move`);
}
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
  // Moves: where it is going, and its number there.
  dest_facility_id: id.nullish(),
  dest_tag: z.string().trim().min(1).max(40).nullish(),
});
const COLS = ['kind', 'title', 'description', 'status', 'assigned_to', 'started_on', 'target_on', 'completed_on', 'dest_facility_id', 'dest_tag'];

const SELECT = `
  select w.*, 'WO-' || lpad(w.id::text, 4, '0') as ref,
         i.name as island_name, i.atoll_id, a.code as atoll_code, f.name as facility_name,
         s.tag as asset_tag, s.kind as asset_kind, s.make_model as asset_model,
         cu.full_name as created_by_name,
         df.name as dest_facility_name, di.id as dest_island_id, di.name as dest_island_name, da.code as dest_atoll_code,
         (w.target_on < current_date and ${OPEN}) as overdue,
         (select u.body from work_updates u where u.work_id = w.id order by u.created_at desc limit 1) as last_update,
         (select max(u.created_at) from work_updates u where u.work_id = w.id) as last_update_at,
         count(*) over () as total_count
    from work_orders w
    join islands i on i.id = w.island_id
    join atolls a on a.id = i.atoll_id
    left join facilities f on f.id = w.facility_id
    left join assets s on s.id = w.asset_id
    left join users cu on cu.id = w.created_by
    left join facilities df on df.id = w.dest_facility_id
    left join islands di on di.id = df.island_id
    left join atolls da on da.id = di.atoll_id`;

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

  // A move's progress, applied in the same transaction as the status change:
  // under way -> the asset is out of service ("being moved to X");
  // completed -> the asset is transferred, with its history, and put on
  // standby there; cancelled once under way -> its status needs checking.
  async function applyMoveProgress(t, workId, before, userId) {
    const { rows: [w] } = await t.query(`
      select w.id, w.kind, w.status, w.asset_id, w.dest_facility_id, w.dest_tag, w.completed_on,
             'WO-' || lpad(w.id::text, 4, '0') as ref, df.name as dest_facility, di.name as dest_island, da.code as dest_atoll,
             f.name as from_facility, i.name as from_island, a.code as from_atoll
        from work_orders w
        join assets s on s.id = w.asset_id join facilities f on f.id = s.facility_id
        join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
        left join facilities df on df.id = w.dest_facility_id left join islands di on di.id = df.island_id
        left join atolls da on da.id = di.atoll_id
       where w.id = $1`, [workId]);
    if (!w || w.kind !== 'relocation' || w.status === before) return null;
    const dest = `${w.dest_atoll}. ${w.dest_island}`;
    const status = (st, note) => t.query(
      `insert into asset_status_log (asset_id, status, note, reported_at, reported_by) values ($1, $2, $3, now(), $4)`,
      [w.asset_id, st, note, userId]);
    if (MOVE_STAGES.includes(w.status)) {
      await t.query('update work_orders set started_on = coalesce(started_on, current_date) where id = $1', [w.id]);
      await status('maintenance', `Being moved to ${dest} (${w.ref}): ${STAGE_LABEL[w.status].toLowerCase()}`);
    } else if (w.status === 'completed') {
      await moveAsset(t, {
        assetId: w.asset_id, facilityId: w.dest_facility_id, tag: w.dest_tag, userId, workId: w.id,
        movedOn: w.completed_on || new Date().toISOString().slice(0, 10), notes: w.ref,
      });
      await status('standby', `Installed at ${dest}, moved from ${w.from_atoll}. ${w.from_island} (${w.ref})`);
    } else if (w.status === 'cancelled' && MOVE_STAGES.includes(before)) {
      await status('unknown', `Move to ${dest} cancelled (${w.ref}): set its status`);
    }
    return { ...w, before, dest };
  }

  // Each stage of a move goes to the technical Telegram groups.
  const moveAlert = async (m, user, note) => {
    if (!m) return;
    const w = one((await db.query(`${SELECT} where w.id = $1`, [m.id])).rows);
    const icon = m.status === 'completed' ? '✅' : m.status === 'cancelled' ? '✖' : '🚚';
    await telegram.alert(`${icon} <b>${esc(assetName({ kind: w.asset_kind, tag: m.status === 'completed' ? w.asset_tag : w.asset_tag }))} move: ${STAGE_LABEL[m.status]}</b>\n${esc(m.from_atoll)}. ${esc(m.from_island)} → ${esc(m.dest)}${note ? `\n${esc(note.slice(0, 200))}` : ''}\n<i>${esc(user.fullName)}</i> · ${telegram.link(`/work/${m.id}`, m.ref)}`, { technical: true });
  };

  // Running a work item (create, edit, change status, post updates) is for
  // technical managers of its island and administrators. Others may only
  // comment, and only when added to it (work_commenters).
  const canRun = (user, island) => user.role === 'admin'
    || (hasRole(user, 'manager') && user.technical && canWriteIsland(user, island));
  async function workAccess(user, workId) {
    const { rows } = await db.query(`
      select w.id, w.island_id, w.status, w.created_by, i.atoll_id,
             exists (select 1 from work_commenters c where c.work_id = w.id and c.user_id = $2) as commenter
        from work_orders w join islands i on i.id = w.island_id where w.id = $1`, [workId, user.id]);
    const w = one(rows, 'Work');
    const run = canRun(user, { id: w.island_id, atoll_id: w.atoll_id });
    // Staff allowed to update work: post updates and move it along, but not
    // create, edit, complete or cancel it.
    const update = run || (user.role === 'staff' && allowed(user, 'work') && canWriteIsland(user, { id: w.island_id, atoll_id: w.atoll_id }));
    return { ...w, run, update, comment: update || w.commenter, share: run || (w.created_by === user.id && user.technical) };
  }
  const technicalOnly = (user) => {
    if (!user.technical) throw forbidden('Work is started and run by technical staff');
  };

  app.get('/work', async (req, reply) => {
    const q = parse(listQuery, req.query);
    const w = new Where()
      .add('(w.island_id = ? or df.island_id = ?)', q.island_id).add('i.atoll_id = ?', q.atoll_id).add('w.asset_id = ?', q.asset_id)
      .add('w.kind = ?', q.kind).add('w.service = ?', q.service)
      .add('(w.title ilike ? or w.description ilike ? or i.name ilike ? or w.assigned_to ilike ?)', q.q && `%${q.q}%`);
    if (q.status === 'open') w.raw(OPEN);
    else if (q.status !== 'all') w.add('w.status = ?', q.status);
    const csv = q.format === 'csv';
    const { rows } = await db.query(`${SELECT} ${w.sql}
      order by (${OPEN}) desc,
               array_position(array['in_progress','dismantling','in_transit','installing','awaiting_parts','on_hold','planned','completed','cancelled'], w.status),
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
    const access = await workAccess(req.user, workId);
    work.can_run = access.run;
    work.can_update = access.update;
    work.can_comment = access.comment;
    work.can_share = access.share;
    work.commenters = (await db.query(`
      select c.user_id, u.full_name, u.designation, (u.technical or u.role = 'admin') as technical, c.added_at, a.full_name as added_by_name
        from work_commenters c join users u on u.id = c.user_id left join users a on a.id = c.added_by
       where c.work_id = $1 order by u.full_name`, [workId])).rows;
    work.updates = (await db.query(`
      select u.*, us.full_name as created_by_name from work_updates u left join users us on us.id = u.created_by
       where u.work_id = $1 order by u.created_at desc`, [workId])).rows;
    return work;
  });

  app.post('/work', manager, async (req, reply) => {
    technicalOnly(req.user);
    const b = parse(body, req.body);
    if (b.kind === 'relocation' && b.status === 'in_progress') b.status = 'planned';
    checkStatus(b.kind, b.status);
    const where = await locate(db, b);
    await assertIslandWrite(db, req.user, { islandId: where.island_id });
    let plan = null;
    if (b.kind === 'relocation') {
      if (!b.asset_id) throw badRequest('Choose the genset or asset being moved');
      plan = await checkMovePlan(db, { assetId: b.asset_id, destFacilityId: b.dest_facility_id, destTag: b.dest_tag });
      await assertIslandWrite(db, req.user, { islandId: plan.dest.island_id });
    }
    let move = null;
    const rows = await db.tx(req.user.id, async (t) => {
      const res = await t.query(`
        insert into work_orders (island_id, facility_id, asset_id, kind, title, description, status, assigned_to,
                                 started_on, target_on, completed_on, created_by, service, dest_facility_id, dest_tag)
        values ($1, $2, $3, $4, $5, $6, $7, $8,
                coalesce($9, case when $7 in ('in_progress', 'awaiting_parts', 'dismantling', 'in_transit', 'installing') then current_date end),
                $10, case when $7 = 'completed' then coalesce($11, current_date) end, $12, $13, $14, $15)
        returning id`,
      [where.island_id, where.facility_id, where.asset_id, b.kind, b.title, b.description, b.status, b.assigned_to,
        b.started_on ?? null, b.target_on ?? null, b.completed_on ?? null, req.user.id, where.service,
        plan ? plan.dest.id : null, plan ? plan.tag : null]);
      if (plan) move = await applyMoveProgress(t, res.rows[0].id, null, req.user.id);
      return res.rows;
    });
    if (move) await moveAlert(move, req.user, b.description);
    reply.code(201);
    const row = one((await db.query(`${SELECT} where w.id = $1`, [rows[0].id])).rows);
    delete row.total_count;
    return row;
  });

  app.patch('/work/:id', manager, async (req) => {
    const { id: workId } = parse(serialParam, req.params);
    const patch = parse(body.omit({ island_id: true, asset_id: true, facility_id: true, service: true }).partial(), req.body);
    for (const k of Object.keys(patch)) if (!(k in (req.body || {}))) delete patch[k];
    const current = one((await db.query(
      'select island_id, status, completed_on, kind, asset_id, dest_facility_id, dest_tag from work_orders where id = $1', [workId])).rows, 'Work');
    technicalOnly(req.user);
    await assertIslandWrite(db, req.user, { islandId: current.island_id });
    if (patch.kind && patch.kind !== current.kind && (patch.kind === 'relocation' || current.kind === 'relocation')) {
      throw badRequest('A genset move cannot be changed into other work, or the other way round');
    }
    checkStatus(current.kind, patch.status);
    if (current.kind !== 'relocation') { delete patch.dest_facility_id; delete patch.dest_tag; }
    const finished = ['completed', 'cancelled'].includes(current.status);
    if (current.kind === 'relocation' && (patch.dest_facility_id !== undefined || patch.dest_tag !== undefined)) {
      if (finished) throw badRequest('This move is finished; its destination can no longer change');
      const plan = await checkMovePlan(db, { assetId: current.asset_id, destFacilityId: patch.dest_facility_id ?? current.dest_facility_id,
        destTag: patch.dest_tag ?? current.dest_tag, workId });
      await assertIslandWrite(db, req.user, { islandId: plan.dest.island_id });
      patch.dest_facility_id = plan.dest.id;
      patch.dest_tag = plan.tag;
    }
    if (current.kind === 'relocation' && finished && patch.status && patch.status !== current.status) {
      throw badRequest('This move is finished. Start a new move if it is going somewhere else.');
    }
    if (patch.status === 'completed' && !patch.completed_on) patch.completed_on = current.completed_on || new Date().toISOString().slice(0, 10);
    if (patch.status && !['completed', 'cancelled'].includes(patch.status)) patch.completed_on = null;
    const set = updateSet(patch, COLS);
    let move = null;
    await db.tx(req.user.id, async (t) => {
      await t.query(`update work_orders set ${set.sql} where id = $1`, [workId, ...set.values]);
      move = await applyMoveProgress(t, workId, current.status, req.user.id);
    });
    const row = one((await db.query(`${SELECT} where w.id = $1`, [workId])).rows);
    delete row.total_count;
    if (move) await moveAlert(move, req.user);
    else if (patch.status === 'completed' && current.status !== 'completed') await completedAlert(workId, req.user);
    return row;
  });

  app.post('/work/:id/updates', async (req, reply) => {
    const { id: workId } = parse(serialParam, req.params);
    const b = parse(z.object({ body: text(5000), status: z.enum(WORK_STATES).nullish() }), req.body);
    const current = await workAccess(req.user, workId);
    if (!current.run) {
      if (current.update) {
        if (['completed', 'cancelled'].includes(b.status)) throw forbidden('Only a manager can complete or cancel work');
      } else {
        if (!current.commenter) throw forbidden('Only technical managers, or people added to this work, can post here');
        if (b.status) throw forbidden('You can comment on this work but not change its status');
      }
    }
    const { rows: [k] } = await db.query('select kind from work_orders where id = $1', [workId]);
    checkStatus(k.kind, b.status);
    if (k.kind === 'relocation' && b.status && ['completed', 'cancelled'].includes(current.status) && b.status !== current.status) {
      throw badRequest('This move is finished. Start a new move if it is going somewhere else.');
    }
    let move = null;
    const rows = await db.tx(req.user.id, async (t) => {
      const res = await t.query(`
        insert into work_updates (work_id, body, status, created_by) values ($1, $2, $3, $4) returning *`,
      [workId, b.body, b.status ?? null, req.user.id]);
      if (b.status) move = await applyMoveProgress(t, workId, current.status, req.user.id);
      return res.rows;
    });
    reply.code(201);
    if (move) await moveAlert(move, req.user, b.body);
    else if (b.status === 'completed' && current.status !== 'completed') await completedAlert(workId, req.user, b.body);
    return rows[0];
  });

  // People (usually non-technical staff) allowed to comment on one work item.
  app.post('/work/:id/commenters', async (req, reply) => {
    const { id: workId } = parse(serialParam, req.params);
    const { user_id: userId } = parse(z.object({ user_id: id }), req.body);
    const access = await workAccess(req.user, workId);
    if (!access.share) throw forbidden('Only the technical staff running this work can add people to it');
    one((await db.query('select id from users where id = $1 and active', [userId])).rows, 'User');
    await db.tx(req.user.id, (t) => t.query(
      'insert into work_commenters (work_id, user_id, added_by) values ($1, $2, $3) on conflict do nothing', [workId, userId, req.user.id]));
    reply.code(201);
    return { ok: true };
  });

  app.delete('/work/:id/commenters/:userId', async (req) => {
    const { id: workId, userId } = parse(z.object({ id: z.coerce.number().int().positive(), userId: id }), req.params);
    const access = await workAccess(req.user, workId);
    if (!access.share) throw forbidden('Only the technical staff running this work can remove people from it');
    await db.tx(req.user.id, (t) => t.query('delete from work_commenters where work_id = $1 and user_id = $2', [workId, userId]));
    return { ok: true };
  });
}
