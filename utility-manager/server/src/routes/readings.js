import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { parseCsv, sendCsv } from '../csv.js';
import { badRequest } from '../errors.js';
import { Where, date, id, one, optText, parse, service } from '../http.js';

const sheetQuery = z.object({ facility_id: id, date });
const sheetBody = z.object({
  facility_id: id,
  date,
  // metric code -> value; null clears a value that was entered by mistake
  values: z.record(z.string().max(60), z.number().finite().nullable()),
  notes: z.record(z.string().max(60), optText(500)).optional(),
});
const listQuery = z.object({
  facility_id: id.optional(),
  island_id: id.optional(),
  atoll_id: id.optional(),
  service: service.optional(),
  metric: z.string().max(60).optional(),
  from: date,
  to: date,
  format: z.enum(['json', 'csv']).default('json'),
});
const importBody = z.object({ csv: z.string().min(1).max(5_000_000), dry_run: z.boolean().default(false) });

const MAX_IMPORT_ROWS = 20000;

// Today in the department's timezone; readings can't be entered for the future.
async function today(db, tz) {
  return (await db.query('select (now() at time zone $1)::date as d', [tz])).rows[0].d;
}

export default async function readingRoutes(app) {
  const { db, config } = app;
  const operator = { preHandler: requireRole('operator') };

  app.get('/metrics', async (req) => {
    const q = parse(z.object({ service: service.optional() }), req.query);
    const w = new Where().raw('active').add('service = ?', q.service);
    return (await db.query(`select * from metrics ${w.sql} order by service, sort_order`, w.values)).rows;
  });

  // One facility, one day: the daily log form. Includes the previous day's
  // values so operators can spot typos.
  app.get('/readings/sheet', async (req) => {
    const q = parse(sheetQuery, req.query);
    const facility = one((await db.query(`
      select f.id, f.name, f.service, f.kind, f.fuel_capacity_l, f.water_capacity_m3,
             i.id as island_id, i.name as island_name, a.code as atoll_code
        from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
       where f.id = $1`, [q.facility_id])).rows, 'Facility');
    const { rows } = await db.query(`
      select m.code, m.name, m.unit, m.aggregation,
             r.value, r.note, r.entered_at, u.full_name as entered_by_name,
             p.value as previous_value
        from metrics m
        left join readings r on r.metric = m.code and r.facility_id = $1 and r.reading_date = $2
        left join users u on u.id = r.entered_by
        left join readings p on p.metric = m.code and p.facility_id = $1 and p.reading_date = $2::date - 1
       where m.service = $3 and m.active
       order by m.sort_order`, [q.facility_id, q.date, facility.service]);
    return { facility, date: q.date, metrics: rows };
  });

  app.put('/readings/sheet', operator, async (req) => {
    const body = parse(sheetBody, req.body);
    if (body.date > await today(db, config.timezone)) throw badRequest('Readings cannot be entered for a future date');
    await assertIslandWrite(db, req.user, { facilityId: body.facility_id });
    const entries = Object.entries(body.values);
    if (!entries.length) throw badRequest('No values given');
    await db.tx(req.user.id, async (t) => {
      for (const [metric, value] of entries) {
        if (value === null) {
          await t.query('delete from readings where facility_id = $1 and reading_date = $2 and metric = $3',
            [body.facility_id, body.date, metric]);
        } else {
          await t.query(`
            insert into readings (facility_id, reading_date, metric, value, note, entered_by)
            values ($1, $2, $3, $4, $5, $6)
            on conflict (facility_id, reading_date, metric) do update
              set value = excluded.value, note = excluded.note, entered_by = excluded.entered_by
              where (readings.value, readings.note) is distinct from (excluded.value, excluded.note)`,
          [body.facility_id, body.date, metric, value, body.notes?.[metric] ?? null, req.user.id]);
        }
      }
    });
    return { ok: true };
  });

  // Raw readings for a period, e.g. to export to Excel.
  app.get('/readings', async (req, reply) => {
    const q = parse(listQuery, req.query);
    if (q.to < q.from) throw badRequest('"to" must be on or after "from"');
    const w = new Where()
      .add('r.reading_date >= ?', q.from).add('r.reading_date <= ?', q.to)
      .add('r.facility_id = ?', q.facility_id).add('f.island_id = ?', q.island_id)
      .add('i.atoll_id = ?', q.atoll_id).add('f.service = ?', q.service).add('r.metric = ?', q.metric);
    const { rows } = await db.query(`
      select r.reading_date, a.code as atoll_code, i.name as island_name, f.name as facility_name, f.service,
             r.metric, m.name as metric_name, m.unit, r.value, r.note, u.full_name as entered_by_name, r.updated_at
        from readings r
        join metrics m on m.code = r.metric
        join facilities f on f.id = r.facility_id
        join islands i on i.id = f.island_id
        join atolls a on a.id = i.atoll_id
        left join users u on u.id = r.entered_by
        ${w.sql}
       order by r.reading_date, a.code, i.name, f.name, m.sort_order
       limit 50000`, w.values);
    if (q.format === 'csv') {
      return sendCsv(reply, `readings_${q.from}_${q.to}.csv`, rows, [
        ['Date', 'reading_date'], ['Atoll', 'atoll_code'], ['Island', 'island_name'], ['Facility', 'facility_name'],
        ['Service', 'service'], ['Metric', 'metric'], ['Metric name', 'metric_name'], ['Unit', 'unit'],
        ['Value', 'value'], ['Note', 'note'], ['Entered by', 'entered_by_name'],
      ]);
    }
    return rows;
  });

  // Bulk load from CSV (history from the old Excel logs).
  // Columns: atoll, island, facility, date, metric, value[, note]
  // All rows are checked first; nothing is written unless every row is valid.
  app.post('/readings/import', operator, async (req) => {
    const body = parse(importBody, req.body);
    const rows = parseCsv(body.csv);
    if (!rows.length) throw badRequest('The file has no data rows');
    if (rows.length > MAX_IMPORT_ROWS) throw badRequest(`At most ${MAX_IMPORT_ROWS} rows per import`);
    const missing = ['atoll', 'island', 'facility', 'date', 'metric', 'value'].filter((c) => !(c in rows[0]));
    if (missing.length) throw badRequest(`Missing column(s): ${missing.join(', ')}`);

    const [{ rows: facilities }, { rows: metrics }] = await Promise.all([
      db.query(`select f.id, f.service, lower(a.code) || '|' || lower(i.name) || '|' || lower(f.name) as key
                  from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id`),
      db.query('select code, service from metrics'),
    ]);
    const facilityByKey = new Map(facilities.map((f) => [f.key, f]));
    const metricByCode = new Map(metrics.map((m) => [m.code, m]));
    const maxDate = await today(db, config.timezone);

    const errors = [];
    const valid = [];
    const seen = new Set();
    rows.forEach((r, n) => {
      const line = n + 2; // header is line 1
      const fail = (message) => errors.push({ line, message });
      const facility = facilityByKey.get(`${r.atoll.toLowerCase()}|${r.island.toLowerCase()}|${r.facility.toLowerCase()}`);
      const metric = metricByCode.get(r.metric);
      const value = Number(r.value.replace(/,/g, ''));
      if (!facility) return fail(`Unknown facility "${r.facility}" on ${r.atoll} ${r.island}`);
      if (!metric) return fail(`Unknown metric "${r.metric}"`);
      if (metric.service !== facility.service) return fail(`Metric ${r.metric} does not apply to a ${facility.service} facility`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || Number.isNaN(Date.parse(r.date))) return fail(`Date must be YYYY-MM-DD, got "${r.date}"`);
      if (r.date > maxDate) return fail('Date is in the future');
      if (r.value === '' || !Number.isFinite(value)) return fail(`Value must be a number, got "${r.value}"`);
      const key = `${facility.id}|${r.date}|${r.metric}`;
      if (seen.has(key)) return fail('Duplicate row for this facility, date and metric');
      seen.add(key);
      valid.push({ facilityId: facility.id, date: r.date, metric: r.metric, value, note: r.note || null });
    });

    for (const facilityId of new Set(valid.map((v) => v.facilityId))) {
      try {
        await assertIslandWrite(db, req.user, { facilityId });
      } catch (err) {
        errors.push({ line: null, message: `${err.message} (facility ${facilities.find((f) => f.id === facilityId).key})` });
      }
    }
    if (errors.length || body.dry_run) {
      return { ok: errors.length === 0, imported: 0, checked: rows.length, errors: errors.slice(0, 200) };
    }

    await db.tx(req.user.id, async (t) => {
      // Insert in chunks with unnest to keep round-trips low.
      for (let i = 0; i < valid.length; i += 1000) {
        const chunk = valid.slice(i, i + 1000);
        await t.query(`
          insert into readings (facility_id, reading_date, metric, value, note, entered_by)
          select f, d, m, v, n, $6
            from unnest($1::uuid[], $2::date[], $3::text[], $4::numeric[], $5::text[]) as x(f, d, m, v, n)
          on conflict (facility_id, reading_date, metric) do update
            set value = excluded.value, note = excluded.note, entered_by = excluded.entered_by`,
        [chunk.map((c) => c.facilityId), chunk.map((c) => c.date), chunk.map((c) => c.metric),
          chunk.map((c) => c.value), chunk.map((c) => c.note), req.user.id]);
      }
    });
    return { ok: true, imported: valid.length, checked: rows.length, errors: [] };
  });
}
