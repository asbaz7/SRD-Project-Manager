// Monthly genset records per powerhouse: who is up to date (the Updates
// tab) and each genset's or powerhouse's history month by month. Updates are
// entered in the app (routes/gensetUpdates.js); workbooks are no longer
// uploaded, and the ones received before stay in the history.
import { z } from 'zod';
import { date, id, one, parse } from '../http.js';
import { REPORTS_TRACKED_FROM, expectedMonth, isMissing, reportState } from '../gensetRecords.js';
import { localToday } from '../time.js';

export default async function conditionReportRoutes(app) {
  const { db, config } = app;

  // Every powerhouse with its latest report and whether it is up to date.
  app.get('/condition-reports', async (req) => {
    const q = parse(z.object({ atoll_id: id.optional() }), req.query);
    const day = localToday(config.timezone);
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
}
