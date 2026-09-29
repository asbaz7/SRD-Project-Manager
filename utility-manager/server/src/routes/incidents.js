import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { sendCsv } from '../csv.js';
import { badRequest } from '../errors.js';
import { Where, date, datetime, id, one, optText, pageOf, paging, parse, serialParam, service, text, updateSet } from '../http.js';

const CATEGORIES = ['outage', 'breakdown', 'maintenance', 'quality', 'safety', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const createBody = z.object({
  service,
  island_id: id,
  facility_id: id.nullish(),
  asset_id: id.nullish(),
  category: z.enum(CATEGORIES),
  severity: z.enum(SEVERITIES).default('medium'),
  title: text(200),
  description: optText(5000),
  started_at: datetime,
  resolved_at: datetime.nullish(),
  customers_affected: z.number().int().nonnegative().nullish(),
  resolution: optText(5000),
});
const patchBody = createBody.omit({ island_id: true }).partial().extend({
  status: z.enum(['open', 'resolved', 'closed']).optional(),
});
const COLS = ['service', 'facility_id', 'asset_id', 'category', 'severity', 'title', 'description',
  'started_at', 'resolved_at', 'customers_affected', 'resolution', 'status', 'resolved_by'];

const listQuery = paging.extend({
  status: z.enum(['open', 'resolved', 'closed']).optional(),
  service: service.optional(),
  island_id: id.optional(),
  atoll_id: id.optional(),
  asset_id: id.optional(),
  category: z.enum(CATEGORIES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  from: date.optional(),
  to: date.optional(),
  q: z.string().max(100).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const SELECT = `
  select x.*, 'INC-' || lpad(x.id::text, 6, '0') as ref,
         i.name as island_name, i.atoll_id, a.code as atoll_code,
         f.name as facility_name, s.tag as asset_tag, s.kind as asset_kind,
         ru.full_name as reported_by_name, vu.full_name as resolved_by_name,
         round(extract(epoch from (coalesce(x.resolved_at, now()) - x.started_at)) / 60)::int as duration_minutes,
         count(*) over () as total_count
    from incidents x
    join islands i on i.id = x.island_id
    join atolls a on a.id = i.atoll_id
    left join facilities f on f.id = x.facility_id
    left join assets s on s.id = x.asset_id
    left join users ru on ru.id = x.reported_by
    left join users vu on vu.id = x.resolved_by`;

// A facility / asset given with an incident must be on the incident's island.
async function checkLinks(db, islandId, { facility_id, asset_id }) {
  if (facility_id) {
    const { rows } = await db.query('select 1 from facilities where id = $1 and island_id = $2', [facility_id, islandId]);
    if (!rows[0]) throw badRequest('The facility is not on this island');
  }
  if (asset_id) {
    const { rows } = await db.query(`select 1 from assets s join facilities f on f.id = s.facility_id
                                      where s.id = $1 and f.island_id = $2`, [asset_id, islandId]);
    if (!rows[0]) throw badRequest('The asset is not on this island');
  }
}

export default async function incidentRoutes(app) {
  const { db } = app;
  const operator = { preHandler: requireRole('operator') };

  app.get('/incidents', async (req, reply) => {
    const q = parse(listQuery, req.query);
    const w = new Where()
      .add('x.status = ?', q.status).add('x.service = ?', q.service).add('x.island_id = ?', q.island_id)
      .add('i.atoll_id = ?', q.atoll_id).add('x.asset_id = ?', q.asset_id).add('x.category = ?', q.category)
      .add('x.severity = ?', q.severity)
      .add('x.started_at >= ?::date', q.from).add("x.started_at < ?::date + interval '1 day'", q.to)
      .add('(x.title ilike ? or x.description ilike ? or i.name ilike ?)', q.q && `%${q.q}%`);
    const csv = q.format === 'csv';
    const { rows } = await db.query(
      `${SELECT} ${w.sql} order by (x.status = 'open') desc, x.started_at desc
       limit ${csv ? 20000 : q.limit} offset ${csv ? 0 : q.offset}`, w.values);
    if (csv) {
      return sendCsv(reply, 'incidents.csv', rows, [
        ['Ref', 'ref'], ['Atoll', 'atoll_code'], ['Island', 'island_name'], ['Service', 'service'],
        ['Facility', 'facility_name'], ['Asset', 'asset_tag'], ['Category', 'category'], ['Severity', 'severity'],
        ['Title', 'title'], ['Description', 'description'], ['Started', 'started_at'], ['Resolved', 'resolved_at'],
        ['Duration (min)', 'duration_minutes'], ['Customers affected', 'customers_affected'], ['Status', 'status'],
        ['Resolution', 'resolution'], ['Reported by', 'reported_by_name'],
      ]);
    }
    return pageOf(rows, q);
  });

  app.get('/incidents/:id', async (req) => {
    const { id: incidentId } = parse(serialParam, req.params);
    const row = one((await db.query(`${SELECT} where x.id = $1`, [incidentId])).rows, 'Incident');
    delete row.total_count;
    return row;
  });

  app.post('/incidents', operator, async (req, reply) => {
    const body = parse(createBody, req.body);
    await assertIslandWrite(db, req.user, { islandId: body.island_id });
    await checkLinks(db, body.island_id, body);
    const resolved = !!body.resolved_at;
    const { rows } = await db.tx(req.user.id, (t) => t.query(`
      insert into incidents (service, island_id, facility_id, asset_id, category, severity, title, description,
                             started_at, resolved_at, customers_affected, resolution, status, reported_by, resolved_by)
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning id`,
    [body.service, body.island_id, body.facility_id ?? null, body.asset_id ?? null, body.category, body.severity,
      body.title, body.description, body.started_at, body.resolved_at ?? null, body.customers_affected ?? null,
      body.resolution, resolved ? 'resolved' : 'open', req.user.id, resolved ? req.user.id : null]));
    reply.code(201);
    return one((await db.query(`${SELECT} where x.id = $1`, [rows[0].id])).rows);
  });

  app.patch('/incidents/:id', operator, async (req) => {
    const { id: incidentId } = parse(serialParam, req.params);
    const body = parse(patchBody, req.body);
    const current = one((await db.query('select * from incidents where id = $1', [incidentId])).rows, 'Incident');
    await assertIslandWrite(db, req.user, { islandId: current.island_id });
    await checkLinks(db, current.island_id, body);

    const fields = { ...body };
    // Resolving stamps who and when; reopening clears them.
    if (body.status === 'resolved' || body.status === 'closed') {
      fields.resolved_at ??= current.resolved_at ?? new Date().toISOString();
      if (current.status === 'open') fields.resolved_by = req.user.id;
    } else if (body.status === 'open') {
      fields.resolved_at = null;
      fields.resolved_by = null;
    } else if (body.resolved_at && current.status === 'open') {
      fields.status = 'resolved';
      fields.resolved_by = req.user.id;
    }
    const set = updateSet(fields, COLS);
    await db.tx(req.user.id, (t) => t.query(`update incidents set ${set.sql} where id = $1`, [incidentId, ...set.values]));
    const row = one((await db.query(`${SELECT} where x.id = $1`, [incidentId])).rows);
    delete row.total_count;
    return row;
  });
}
