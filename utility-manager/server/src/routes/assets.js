import { z } from 'zod';
import { assertIslandWrite, canWriteIsland, requireRole } from '../auth.js';
import { expectedMonth } from '../reportImport.js';
import { ENGINE_SELECT, describeEngine, loadIntervals, mvToday } from './engines.js';
import { sendCsv } from '../csv.js';
import { conflict } from '../errors.js';
import { assetName, esc } from '../telegram.js';
import {
  Where, date, datetime, id, idParam, one, optNumber, optText, pageOf, paging, parse, service, text, updateSet,
} from '../http.js';

const FACILITY_KINDS = ['powerhouse', 'solar_plant', 'water_plant', 'water_storage', 'sewerage_plant', 'pump_station', 'other'];
const ASSET_KINDS = ['genset', 'solar_inverter', 'battery', 'transformer', 'ro_unit', 'pump', 'blower', 'tank', 'other'];
const STATUSES = ['running', 'standby', 'down', 'maintenance', 'decommissioned', 'unknown'];

const facilityBody = z.object({
  island_id: id,
  service,
  kind: z.enum(FACILITY_KINDS),
  name: text(150),
  fuel_capacity_l: optNumber,
  water_capacity_m3: optNumber,
  commissioned_on: z.iso.date().nullish(),
  // First month a condition report is expected; empty = not surveyed yet.
  reports_from: z.iso.date().refine((d) => d.endsWith('-01'), 'must be the first day of a month').nullish(),
  notes: optText(),
  active: z.boolean().optional(),
});
const FACILITY_COLS = ['service', 'kind', 'name', 'fuel_capacity_l', 'water_capacity_m3', 'commissioned_on', 'reports_from', 'notes', 'active'];

const assetBody = z.object({
  facility_id: id,
  kind: z.enum(ASSET_KINDS),
  tag: text(50),
  make_model: optText(150),
  serial_no: optText(100),
  rated_capacity: optNumber,
  operating_capacity: optNumber,
  capacity_unit: optText(20),
  commissioned_on: z.iso.date().nullish(),
  running_hours: optNumber,
  notes: optText(),
  active: z.boolean().optional(),
  fixed_asset_code: optText(50),
  alt_make: optText(100),
  alt_serial: optText(100),
  alt_frame: optText(100),
  cpl_spec: optText(50),
  alt_kw: optNumber,
  next_overhaul_hours: optNumber,
  next_overhaul_on: z.iso.date().nullish(),
  next_alt_service_on: z.iso.date().nullish(),
});
const ASSET_COLS = ['kind', 'tag', 'make_model', 'serial_no', 'rated_capacity', 'operating_capacity',
  'capacity_unit', 'commissioned_on', 'running_hours', 'notes', 'active', 'fixed_asset_code', 'alt_make',
  'alt_serial', 'alt_frame', 'cpl_spec', 'alt_kw', 'next_overhaul_hours', 'next_overhaul_on', 'next_alt_service_on'];

const statusItem = z.object({
  asset_id: id,
  status: z.enum(STATUSES),
  note: optText(1000),
  running_hours: optNumber,
});
const statusBatch = z.object({
  reported_at: datetime.optional(),
  items: z.array(statusItem).min(1).max(200),
});

const ASSET_LIST = `
  select s.*, f.name as facility_name, f.service, f.island_id, i.atoll_id, i.name as island_name,
         a.code as atoll_code, u.full_name as status_by_name, count(*) over () as total_count
    from assets s
    join facilities f on f.id = s.facility_id
    join islands i on i.id = f.island_id
    join atolls a on a.id = i.atoll_id
    left join users u on u.id = s.status_by`;

export default async function assetRoutes(app) {
  const { db, telegram } = app;
  const manager = { preHandler: requireRole('manager') };

  // --- Facilities -----------------------------------------------------------
  app.get('/facilities', async (req) => {
    const q = parse(z.object({ island_id: id.optional(), service: service.optional(), kind: z.enum(FACILITY_KINDS).optional() }), req.query);
    const w = new Where().raw('f.active')
      .add('f.island_id = ?', q.island_id).add('f.service = ?', q.service).add('f.kind = ?', q.kind);
    const { rows } = await db.query(`
      select f.*, i.name as island_name, i.atoll_id, a.code as atoll_code
        from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
        ${w.sql} order by a.code, i.name, f.service, f.name`, w.values);
    return rows;
  });

  app.get('/facilities/:id', async (req) => {
    const { id: facilityId } = parse(idParam, req.params);
    const facility = one((await db.query(`
      select f.*, i.name as island_name, i.atoll_id, a.code as atoll_code
        from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
       where f.id = $1`, [facilityId])).rows, 'Facility');
    facility.assets = (await db.query(
      'select * from assets where facility_id = $1 order by kind, length(tag), tag', [facilityId])).rows;
    return facility;
  });

  app.post('/facilities', manager, async (req, reply) => {
    const body = parse(facilityBody, req.body);
    await assertIslandWrite(db, req.user, { islandId: body.island_id });
    const cols = ['island_id', ...FACILITY_COLS].filter((k) => body[k] !== undefined);
    const row = await db.tx(req.user.id, async (t) => one((await t.query(
      `insert into facilities (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      cols.map((k) => body[k]))).rows));
    reply.code(201);
    return row;
  });

  app.patch('/facilities/:id', manager, async (req) => {
    const { id: facilityId } = parse(idParam, req.params);
    const body = parse(facilityBody.omit({ island_id: true }).partial(), req.body);
    await assertIslandWrite(db, req.user, { facilityId });
    const set = updateSet(body, FACILITY_COLS);
    return db.tx(req.user.id, async (t) => one((await t.query(
      `update facilities set ${set.sql} where id = $1 returning *`, [facilityId, ...set.values])).rows, 'Facility'));
  });

  // Deleting is for facilities added by mistake (e.g. a test). Real ones that
  // close are marked not in use, which keeps their history; so anything with
  // work, incidents, projects or readings on it can't be deleted.
  app.delete('/facilities/:id', { preHandler: requireRole('admin') }, async (req) => {
    const { id: facilityId } = parse(idParam, req.params);
    await db.tx(req.user.id, async (t) => {
      const f = one((await t.query('select id, name from facilities where id = $1', [facilityId])).rows, 'Facility');
      const linked = (await t.query(`
        select (select count(*) from work_orders w where w.facility_id = $1 or w.asset_id in (select id from assets where facility_id = $1))::int as work,
               (select count(*) from incidents i where i.facility_id = $1 or i.asset_id in (select id from assets where facility_id = $1))::int as incidents,
               (select count(*) from projects p where p.facility_id = $1)::int as projects,
               (select count(*) from readings r where r.facility_id = $1)::int as readings`, [facilityId])).rows[0];
      const used = Object.entries(linked).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}`);
      if (used.length) throw conflict(`${f.name} has ${used.join(', ')} recorded against it. Untick "In use" instead to keep that history.`);
      await t.query('delete from assets where facility_id = $1', [facilityId]);
      await t.query('delete from facilities where id = $1', [facilityId]);
    });
    return { ok: true };
  });

  // --- Assets ---------------------------------------------------------------
  const assetQuery = paging.extend({
    island_id: id.optional(),
    atoll_id: id.optional(),
    facility_id: id.optional(),
    service: service.optional(),
    kind: z.enum(ASSET_KINDS).optional(),
    status: z.enum(STATUSES).optional(),
    q: z.string().max(100).optional(),
    include_inactive: z.coerce.boolean().optional(),
    format: z.enum(['json', 'csv']).default('json'),
  });

  app.get('/assets', async (req, reply) => {
    const q = parse(assetQuery, req.query);
    const w = new Where();
    if (!q.include_inactive) w.raw('s.active and f.active');
    w.add('f.island_id = ?', q.island_id).add('i.atoll_id = ?', q.atoll_id).add('s.facility_id = ?', q.facility_id)
      .add('f.service = ?', q.service).add('s.kind = ?', q.kind).add('s.status = ?', q.status)
      .add('(s.tag ilike ? or s.make_model ilike ? or i.name ilike ?)', q.q && `%${q.q}%`);
    const csv = q.format === 'csv';
    const { rows } = await db.query(
      `${ASSET_LIST} ${w.sql} order by a.code, i.name, f.name, s.kind, length(s.tag), s.tag
       limit ${csv ? 20000 : q.limit} offset ${csv ? 0 : q.offset}`, w.values);
    if (csv) {
      return sendCsv(reply, 'assets.csv', rows, [
        ['Atoll', 'atoll_code'], ['Island', 'island_name'], ['Facility', 'facility_name'], ['Service', 'service'],
        ['Kind', 'kind'], ['Tag', 'tag'], ['Make / model', 'make_model'], ['Serial no', 'serial_no'],
        ['Rated capacity', 'rated_capacity'], ['Operating capacity', 'operating_capacity'], ['Unit', 'capacity_unit'],
        ['Running hours', 'running_hours'], ['Status', 'status'], ['Status note', 'status_note'], ['Status at', 'status_at'],
      ]);
    }
    return pageOf(rows, q);
  });

  app.get('/assets/:id', async (req) => {
    const { id: assetId } = parse(idParam, req.params);
    const asset = one((await db.query(`${ASSET_LIST} where s.id = $1`, [assetId])).rows, 'Asset');
    delete asset.total_count;
    asset.can_edit = canWriteIsland(req.user, { id: asset.island_id, atoll_id: asset.atoll_id });
    asset.history = (await db.query(`
      select l.id, l.status, l.note, l.running_hours, l.reported_at, u.full_name as reported_by_name
        from asset_status_log l left join users u on u.id = l.reported_by
       where l.asset_id = $1 order by l.reported_at desc limit 100`, [assetId])).rows;
    asset.moves = (await db.query(`
      select m.id, m.from_tag, m.to_tag, m.moved_on, m.notes, m.source, m.created_at, u.full_name as moved_by_name, m.work_id,
             fi.name as from_island, fa.code as from_atoll, ff.name as from_facility, ti.name as to_island, ta.code as to_atoll
        from asset_moves m
        left join facilities ff on ff.id = m.from_facility_id left join islands fi on fi.id = ff.island_id left join atolls fa on fa.id = fi.atoll_id
        left join facilities tf on tf.id = m.to_facility_id left join islands ti on ti.id = tf.island_id left join atolls ta on ta.id = ti.atoll_id
        left join users u on u.id = m.moved_by
       where m.asset_id = $1 order by m.moved_on desc, m.id desc`, [assetId])).rows;
    asset.incidents = (await db.query(`
      select id, title, category, severity, status, started_at, resolved_at
        from incidents where asset_id = $1 order by started_at desc limit 50`, [assetId])).rows;
    const [condition, maintenance, work, hours, engine] = await Promise.all([
      db.query(`select c.*, u.full_name as uploaded_by_name from engine_current c
                  left join users u on u.id = c.uploaded_by where c.asset_id = $1`, [assetId]),
      db.query(`select e.*, u.full_name as created_by_name, ed.full_name as edited_by_name, 'WO-' || lpad(e.work_id::text, 4, '0') as work_ref
                  from maintenance_events e left join users u on u.id = e.created_by left join users ed on ed.id = e.edited_by
                 where e.asset_id = $1 order by e.done_on desc, e.id desc`, [assetId]),
      db.query(`select w.id, 'WO-' || lpad(w.id::text, 4, '0') as ref, w.kind, w.title, w.status, w.started_on, w.target_on,
                       w.completed_on, w.assigned_to,
                       (select u.body from work_updates u where u.work_id = w.id order by u.created_at desc limit 1) as last_update
                  from work_orders w where w.asset_id = $1
                 order by (w.status not in ('completed', 'cancelled')) desc, coalesce(w.completed_on, w.started_on) desc nulls first
                 limit 30`, [assetId]),
      db.query('select month, total_hours from hours_log where asset_id = $1 order by month desc limit 13', [assetId]),
      asset.kind === 'genset' ? db.query(`${ENGINE_SELECT} where s.id = $1`, [assetId]) : { rows: [] },
    ]);
    asset.condition = condition.rows[0] || null;
    asset.maintenance = maintenance.rows;
    asset.work = work.rows;
    asset.hours_log = hours.rows.reverse();
    if (engine.rows[0]) {
      const today = await mvToday(db, app.config.timezone);
      const e = describeEngine(engine.rows[0], today, expectedMonth(today), await loadIntervals(db));
      asset.engine = (({ last_overhaul_on, last_alt_service_on, hours_since_overhaul, hours_to_overhaul, overhaul_due, overhaul_rule,
        overhaul_requested, alt_service_due, alt_service_rule, alt_requested, next_alt_service_due, intervals, report_stale }) => ({
        last_overhaul_on, last_alt_service_on, hours_since_overhaul, hours_to_overhaul, overhaul_due, overhaul_rule, overhaul_requested,
        alt_service_due, alt_service_rule, alt_requested, next_alt_service_due, intervals, report_stale }))(e);
      // Average running hours per month over the last year, to project the next overhaul.
      const log = asset.hours_log;
      if (log.length >= 2) {
        const first = log[0], last = log.at(-1);
        const months = (new Date(last.month) - new Date(first.month)) / (30.44 * 86400000);
        const rate = months > 0 ? (last.total_hours - first.total_hours) / months : null;
        asset.engine.hours_per_month = rate && rate > 0 && rate < 744 ? Math.round(rate) : null;
      }
    }
    return asset;
  });

  app.post('/assets', manager, async (req, reply) => {
    const body = parse(assetBody, req.body);
    await assertIslandWrite(db, req.user, { facilityId: body.facility_id });
    const cols = ['facility_id', ...ASSET_COLS].filter((k) => body[k] !== undefined);
    const row = await db.tx(req.user.id, async (t) => one((await t.query(
      `insert into assets (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}) returning *`,
      cols.map((k) => body[k]))).rows));
    reply.code(201);
    return row;
  });

  app.patch('/assets/:id', manager, async (req) => {
    const { id: assetId } = parse(idParam, req.params);
    const body = parse(assetBody.omit({ facility_id: true }).partial(), req.body);
    await assertIslandWrite(db, req.user, { assetId });
    const set = updateSet(body, ASSET_COLS);
    // A serial number changed by hand is kept over what reports say.
    const lock = body.serial_no !== undefined
      ? `, serial_locked = (serial_locked or serial_no is distinct from $${set.values.length + 2})` : '';
    return db.tx(req.user.id, async (t) => one((await t.query(
      `update assets set ${set.sql}${lock} where id = $1 returning *`,
      [assetId, ...set.values, ...(lock ? [body.serial_no] : [])])).rows, 'Asset'));
  });

  // Status for one or many assets at once (e.g. the morning genset round).
  app.post('/assets/status', manager, async (req) => {
    const body = parse(statusBatch, req.body);
    const reportedAt = body.reported_at ?? new Date().toISOString();
    for (const assetId of new Set(body.items.map((i) => i.asset_id))) {
      await assertIslandWrite(db, req.user, { assetId });
    }
    const before = (await db.query(
      `select s.id, s.kind, s.tag, s.status, f.service, i.name as island_name, a.code as atoll_code
         from assets s join facilities f on f.id = s.facility_id join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
        where s.id = any($1::uuid[])`, [body.items.map((i) => i.asset_id)])).rows;
    await db.tx(req.user.id, async (t) => {
      for (const item of body.items) {
        await t.query(
          `insert into asset_status_log (asset_id, status, note, running_hours, reported_at, reported_by)
           values ($1, $2, $3, $4, $5, $6)`,
          [item.asset_id, item.status, item.note, item.running_hours ?? null, reportedAt, req.user.id]);
      }
    });
    // A genset set down has open work (created or updated by a trigger,
    // migration 017): say which, in the reply and the alert.
    const work = {};
    for (const item of body.items.filter((i) => i.status === 'down')) {
      const { rows: [w] } = await db.query(`select id, 'WO-' || lpad(id::text, 4, '0') as ref, title from work_orders
        where asset_id = $1 and kind <> 'relocation' and status not in ('completed', 'cancelled') order by created_at desc limit 1`, [item.asset_id]);
      if (w) work[item.asset_id] = w;
    }
    // Telegram: something going out of service, or coming back.
    const lines = [];
    for (const item of body.items) {
      const a = before.find((x) => x.id === item.asset_id);
      if (!a || a.status === item.status) continue;
      const name = `${a.atoll_code}. ${a.island_name} ${assetName(a)}`;
      if (item.status === 'down') lines.push(`🔴 <b>${esc(name)} is down</b>${item.note ? `: ${esc(item.note)}` : ''}${work[item.asset_id] ? ` · 🔧 ${telegram.link(`/work/${work[item.asset_id].id}`, work[item.asset_id].ref)}` : ''}`);
      else if (item.status === 'running' && ['down', 'maintenance'].includes(a.status)) lines.push(`🟢 <b>${esc(name)} is running again</b>${item.note ? `: ${esc(item.note)}` : ''}`);
    }
    if (lines.length) await telegram.alert(`${lines.join('\n')}\n<i>${esc(req.user.fullName)}</i>${lines.length === 1 ? ` · ${telegram.link(`/assets/${body.items[0].asset_id}`, 'Open')}` : ''}`, { technical: true });
    return { ok: true, count: body.items.length, work: Object.entries(work).map(([assetId, w]) => ({ asset_id: assetId, ...w })) };
  });

}
