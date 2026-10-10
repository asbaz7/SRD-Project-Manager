import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { parseConditionReport } from '../conditionReport.js';
import { badRequest } from '../errors.js';
import { date, datetime, id, one, optText, parse, text } from '../http.js';
import { REPORTS_TRACKED_FROM, applyFleetReport, applyImport, expectedMonth, isMissing, matchIsland, planImport, reportState } from '../reportImport.js';

const upload = z.object({
  file_name: z.string().trim().max(300).default(''),
  data: z.string().min(10).max(4_000_000),     // base64 of the .xlsx (≈3 MB max)
  island_id: id.optional(),                    // confirms or overrides the matched island
});

function decodeBase64(data) {
  const clean = data.replace(/^data:[^,]*,/, '');
  try {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    throw badRequest('The file could not be read');
  }
}

const hours = z.number().nonnegative().max(1_000_000).nullish();
const kw = z.number().nonnegative().max(100_000).nullish();
const fleetReport = z.object({
  facility_id: id.nullish(),                   // optional: taken from the engines
  report_month: date.refine((d) => d.endsWith('-01'), 'must be the first day of the month'),
  reported_on: date.nullish(),
  file_name: optText(300),
  source_ref: optText(200),                    // e.g. 'ECR import #412'
  peak_load: z.object({ kw: z.number().nonnegative().max(100_000), at: z.union([datetime, date]).nullish() }).nullish(),
  held_rows: z.array(z.object({ genset: z.string().trim().max(40).nullish(), reason: text(500) })).max(100).default([]),
  engines: z.array(z.object({
    srd_asset_id: id,
    status_text: optText(200),
    condition: z.enum(['ok', 'minor_fault', 'major_fault', 'not_running']).nullish(),
    fault: optText(2000),
    total_hours: hours, hours_since_overhaul: hours, hours_since_valve: hours,
    last_overhaul_on: date.nullish(), last_valve_on: date.nullish(), last_battery_on: date.nullish(), last_alt_service_on: date.nullish(),
    needs_overhaul: z.boolean().nullish(), alt_needs_service: z.boolean().nullish(), overhaul_spares_received: z.boolean().nullish(),
    max_load_kw: kw, capable_kw: kw,
  })).max(40),
});

async function today(db, tz) {
  return (await db.query('select to_char((now() at time zone $1)::date, \'YYYY-MM-DD\') as d', [tz])).rows[0].d;
}

export default async function conditionReportRoutes(app) {
  const { db, config } = app;

  // Every powerhouse with its latest report and whether it is up to date.
  app.get('/condition-reports', async (req) => {
    const q = parse(z.object({ atoll_id: id.optional() }), req.query);
    const day = await today(db, config.timezone);
    const expected = expectedMonth(day);
    const { rows } = await db.query(`
      select f.id as facility_id, f.name as facility_name, f.reports_from, i.id as island_id, i.name as island_name,
             a.id as atoll_id, a.code as atoll_code,
             r.report_month, r.reported_on, r.uploaded_at, r.file_name, r.peak_load_month, r.source, r.held_rows, u.full_name as uploaded_by_name,
             (select count(*) from assets s where s.facility_id = f.id and s.kind = 'genset' and s.active) as genset_count
        from facilities f
        join islands i on i.id = f.island_id and i.active
        join atolls a on a.id = i.atoll_id
        left join powerhouse_reports r on r.facility_id = f.id
        left join users u on u.id = r.uploaded_by
       where f.active and f.service = 'electricity' and f.kind = 'powerhouse'
         and ($1::uuid is null or i.atoll_id = $1)
       order by (r.report_month is null) desc, r.report_month, a.code, i.name`, [q.atoll_id ?? null]);
    for (const r of rows) r.state = reportState(r.report_month, expected, r.reports_from);
    return {
      today: day,
      expected_month: expected,
      due_day: 10,
      powerhouses: rows,
      missing: rows.filter((r) => isMissing(r.state)).length,
      not_expected: rows.filter((r) => r.state === 'not_expected').length,
      tracked_from: REPORTS_TRACKED_FROM,
    };
  });

  // A powerhouse's report for a month, checked and sent by Fleet Manager
  // right after it imports the island's sheet. Sending the same month again
  // replaces what it sent before.
  app.post('/condition-reports', { preHandler: requireRole('manager') }, async (req) => {
    const b = parse(fleetReport, req.body);
    const ids = [...new Set(b.engines.map((e) => e.srd_asset_id))];
    if (ids.length !== b.engines.length) throw badRequest('Each genset may appear only once');
    const { rows } = await db.query(`
      select a.id, a.tag, a.kind, a.active, a.status, a.status_at, a.facility_id, f.kind as facility_kind, f.service
        from assets a join facilities f on f.id = a.facility_id where a.id = any($1::uuid[])`, [ids]);
    const assets = new Map(rows.map((a) => [a.id, a]));
    const unknown = ids.filter((x) => !assets.has(x));
    if (unknown.length) throw badRequest(`Unknown srd_asset_id: ${unknown.join(', ')}`);
    const notGenset = rows.filter((a) => a.kind !== 'genset' || !a.active);
    if (notGenset.length) throw badRequest(`Not an active genset: ${notGenset.map((a) => a.id).join(', ')}`);
    const facilities = new Set(rows.map((a) => a.facility_id));
    if (b.facility_id) facilities.add(b.facility_id);
    if (facilities.size !== 1) {
      throw badRequest(facilities.size ? 'All gensets in one report must be at the same powerhouse' : 'Give facility_id, or at least one genset');
    }
    const [facilityId] = facilities;
    const { rows: [f] } = await db.query('select id, island_id, kind, service from facilities where id = $1 and active', [facilityId]);
    if (!f || f.service !== 'electricity') throw badRequest('facility_id is not an electricity facility');
    await assertIslandWrite(db, req.user, { islandId: f.island_id });
    const result = await db.tx(req.user.id, (t) => applyFleetReport(t, b, { facilityId, assets, userId: req.user.id }));
    return { ok: true, facility_id: facilityId, report_month: b.report_month, ...result };
  });

  // Report history, month by month and per source, for a powerhouse or a
  // genset (newest first).
  app.get('/condition-reports/history', async (req) => {
    const q = parse(z.object({ facility_id: id.optional(), asset_id: id.optional(), from: date.optional(), to: date.optional() })
      .refine((x) => x.facility_id || x.asset_id, 'Give facility_id or asset_id'), req.query);
    const range = [q.from ?? '1900-01-01', q.to ?? '2999-12-31'];
    const facilityId = q.facility_id
      ?? one((await db.query('select facility_id from assets where id = $1', [q.asset_id])).rows, 'Asset').facility_id;
    const [powerhouse, engines] = await Promise.all([
      db.query(`select r.*, u.full_name as received_by_name from powerhouse_report_history r left join users u on u.id = r.received_by
                 where r.facility_id = $1 and r.report_month between $2 and $3 order by r.report_month desc, r.source`, [facilityId, ...range]),
      db.query(`select r.*, a.tag from engine_reports r join assets a on a.id = r.asset_id
                 where ${q.asset_id ? 'r.asset_id = $1' : 'a.facility_id = $1'} and r.report_month between $2 and $3
                 order by r.report_month desc, length(a.tag), a.tag, r.source`, [q.asset_id ?? facilityId, ...range]),
    ]);
    return { facility_id: facilityId, powerhouse: powerhouse.rows, engines: engines.rows };
  });

  // Reads an uploaded workbook and says what it would change. Nothing is saved.
  app.post('/condition-reports/preview', { preHandler: requireRole('manager') }, async (req) => {
    const body = parse(upload, req.body);
    let parsed;
    try {
      parsed = parseConditionReport(decodeBase64(body.data), body.file_name);
    } catch (err) {
      throw badRequest(err.message);
    }
    const { rows: islands } = await db.query(`
      select i.id, i.name, i.atoll_id, a.code as atoll_code from islands i join atolls a on a.id = i.atoll_id where i.active`);
    let island;
    let candidates = [];
    if (body.island_id) {
      island = islands.find((i) => i.id === body.island_id);
      if (!island) throw badRequest('Unknown island');
    } else {
      ({ island, candidates } = matchIsland(islands, parsed.powerhouse, body.file_name));
    }
    const result = {
      file_name: body.file_name,
      powerhouse: parsed.powerhouse,
      island: island || null,
      candidates,
      islands: islands.map(({ id: islandId, name, atoll_code }) => ({ id: islandId, name, atoll_code }))
        .sort((a, b) => a.atoll_code.localeCompare(b.atoll_code) || a.name.localeCompare(b.name)),
    };
    if (!island) return { ...result, ok: false };
    let canWrite = true;
    try {
      await assertIslandWrite(db, req.user, { islandId: island.id });
    } catch {
      canWrite = false;
    }
    return { ...result, ok: canWrite, can_write: canWrite, ...(await planImport(db, parsed, island.id)) };
  });

  app.post('/condition-reports/import', { preHandler: requireRole('manager') }, async (req) => {
    const body = parse(upload.required({ island_id: true }), req.body);
    await assertIslandWrite(db, req.user, { islandId: body.island_id });
    let parsed;
    try {
      parsed = parseConditionReport(decodeBase64(body.data), body.file_name);
    } catch (err) {
      throw badRequest(err.message);
    }
    const counts = await db.tx(req.user.id, (t) => applyImport(t, parsed, {
      islandId: body.island_id, userId: req.user.id, fileName: body.file_name,
    }));
    return { ok: true, report_month: parsed.latest.month, ...counts };
  });
}
