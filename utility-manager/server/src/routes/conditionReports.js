import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { parseConditionReport } from '../conditionReport.js';
import { badRequest } from '../errors.js';
import { id, parse } from '../http.js';
import { applyImport, expectedMonth, matchIsland, planImport } from '../reportImport.js';

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
      select f.id as facility_id, f.name as facility_name, i.id as island_id, i.name as island_name,
             a.id as atoll_id, a.code as atoll_code,
             r.report_month, r.reported_on, r.uploaded_at, r.file_name, r.peak_load_month, u.full_name as uploaded_by_name,
             (select count(*) from assets s where s.facility_id = f.id and s.kind = 'genset' and s.active) as genset_count
        from facilities f
        join islands i on i.id = f.island_id and i.active
        join atolls a on a.id = i.atoll_id
        left join powerhouse_reports r on r.facility_id = f.id
        left join users u on u.id = r.uploaded_by
       where f.active and f.service = 'electricity' and f.kind = 'powerhouse'
         and ($1::uuid is null or i.atoll_id = $1)
       order by (r.report_month is null) desc, r.report_month, a.code, i.name`, [q.atoll_id ?? null]);
    for (const r of rows) {
      r.state = !r.report_month ? 'never' : r.report_month >= expected ? 'up_to_date' : 'missing';
    }
    return {
      today: day,
      expected_month: expected,
      due_day: 10,
      powerhouses: rows,
      missing: rows.filter((r) => r.state !== 'up_to_date').length,
    };
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
