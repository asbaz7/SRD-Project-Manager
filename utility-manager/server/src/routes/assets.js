import { z } from 'zod';
import { assertIslandWrite, canWriteIsland, requireRole } from '../auth.js';
import { sendCsv } from '../csv.js';
import {
  Where, datetime, id, idParam, one, optNumber, optText, pageOf, paging, parse, service, text, updateSet,
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
  notes: optText(),
  active: z.boolean().optional(),
});
const FACILITY_COLS = ['service', 'kind', 'name', 'fuel_capacity_l', 'water_capacity_m3', 'commissioned_on', 'notes', 'active'];

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
});
const ASSET_COLS = ['kind', 'tag', 'make_model', 'serial_no', 'rated_capacity', 'operating_capacity',
  'capacity_unit', 'commissioned_on', 'running_hours', 'notes', 'active'];

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
  const { db } = app;
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
    asset.incidents = (await db.query(`
      select id, title, category, severity, status, started_at, resolved_at
        from incidents where asset_id = $1 order by started_at desc limit 50`, [assetId])).rows;
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
    return db.tx(req.user.id, async (t) => one((await t.query(
      `update assets set ${set.sql} where id = $1 returning *`, [assetId, ...set.values])).rows, 'Asset'));
  });

  // Status for one or many assets at once (e.g. the morning genset round).
  app.post('/assets/status', manager, async (req) => {
    const body = parse(statusBatch, req.body);
    const reportedAt = body.reported_at ?? new Date().toISOString();
    for (const assetId of new Set(body.items.map((i) => i.asset_id))) {
      await assertIslandWrite(db, req.user, { assetId });
    }
    await db.tx(req.user.id, async (t) => {
      for (const item of body.items) {
        await t.query(
          `insert into asset_status_log (asset_id, status, note, running_hours, reported_at, reported_by)
           values ($1, $2, $3, $4, $5, $6)`,
          [item.asset_id, item.status, item.note, item.running_hours ?? null, reportedAt, req.user.id]);
      }
    });
    return { ok: true, count: body.items.length };
  });
}
