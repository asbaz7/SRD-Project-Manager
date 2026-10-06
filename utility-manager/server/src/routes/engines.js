import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { sendCsv } from '../csv.js';
import { forbidden } from '../errors.js';
import { Where, date, id, idParam, one, optText, parse, serialParam } from '../http.js';
import { REPORTS_TRACKED_FROM, expectedMonth } from '../reportImport.js';

export const EVENT_KINDS = ['overhaul', 'top_overhaul', 'alternator_service', 'valve_clearance', 'battery_change',
  'repair', 'service', 'inspection', 'other'];
const CONDITION_RANK = { not_running: 0, major_fault: 1, minor_fault: 2, ok: 3 };

// One row per genset: register, live status, latest report and open work.
export const ENGINE_SELECT = `
  select s.id, s.tag, s.make_model, s.serial_no, s.rated_capacity, s.operating_capacity, s.capacity_unit,
         s.status, s.status_note, s.status_at, s.alt_make, s.alt_kw,
         s.next_overhaul_hours, s.next_overhaul_on, s.next_alt_service_on,
         f.id as facility_id, f.name as facility_name, i.id as island_id, i.name as island_name, i.atoll_id, a.code as atoll_code,
         c.report_month, c.reported_on, c.condition, c.report_condition, c.condition_source, c.condition_note, c.condition_at, c.status_text, c.fault, c.total_hours, c.hours_since_overhaul,
         c.last_overhaul_on as report_overhaul_on, c.last_alt_service_on as report_alt_service_on,
         c.needs_overhaul, c.alt_needs_service, c.max_load_kw, c.capable_kw, c.last_valve_on, c.last_battery_on,
         (select max(done_on) from maintenance_events e where e.asset_id = s.id and e.kind in ('overhaul', 'top_overhaul')) as last_overhaul_event,
         (select max(done_on) from maintenance_events e where e.asset_id = s.id and e.kind = 'alternator_service') as last_alt_event,
         (select json_agg(json_build_object('id', w.id, 'title', w.title, 'status', w.status, 'kind', w.kind) order by w.created_at desc)
            from work_orders w where w.asset_id = s.id and w.status not in ('completed', 'cancelled')) as open_work,
         count(*) over () as total_count
    from assets s
    join facilities f on f.id = s.facility_id and f.active
    join islands i on i.id = f.island_id and i.active
    join atolls a on a.id = i.atoll_id
    left join engine_current c on c.asset_id = s.id`;

const maxDate = (...ds) => ds.filter(Boolean).sort().at(-1) || null;

// Adds the figures people actually look for.
export function describeEngine(e, today, expected) {
  const work = typeof e.open_work === 'string' ? JSON.parse(e.open_work) : e.open_work;
  e.open_work = work || [];
  e.last_overhaul_on = maxDate(e.report_overhaul_on, e.last_overhaul_event);
  e.last_alt_service_on = maxDate(e.report_alt_service_on, e.last_alt_event);
  // Hours since overhaul only holds if no later overhaul was recorded.
  if (e.last_overhaul_event && e.report_overhaul_on && e.last_overhaul_event > e.report_overhaul_on) e.hours_since_overhaul = null;
  e.hours_to_overhaul = e.next_overhaul_hours != null && e.total_hours != null ? Math.round(e.next_overhaul_hours - e.total_hours) : null;
  e.overhaul_due = !!(e.needs_overhaul || (e.hours_to_overhaul != null && e.hours_to_overhaul <= 0)
    || (e.next_overhaul_on && e.next_overhaul_on <= today));
  e.alt_service_due = !!(e.alt_needs_service || (e.next_alt_service_on && e.next_alt_service_on <= today));
  e.report_stale = !!e.report_month && e.report_month >= REPORTS_TRACKED_FROM && e.report_month < expected;
  delete e.total_count;
  return e;
}

export async function mvToday(db, tz) {
  return (await db.query("select to_char((now() at time zone $1)::date, 'YYYY-MM-DD') as d", [tz])).rows[0].d;
}

const listQuery = z.object({
  atoll_id: id.optional(),
  island_id: id.optional(),
  condition: z.enum(['ok', 'minor_fault', 'major_fault', 'not_running', 'no_report', 'faults']).optional(),
  flag: z.enum(['overhaul', 'alternator', 'work', 'stale']).optional(),
  q: z.string().max(100).optional(),
  sort: z.enum(['island', 'condition', 'hours_since_overhaul', 'total_hours', 'last_overhaul']).default('island'),
  format: z.enum(['json', 'csv']).default('json'),
});

const eventBody = z.object({
  kind: z.enum(EVENT_KINDS),
  done_on: date,
  running_hours: z.number().nonnegative().nullish(),
  notes: optText(2000),
});

export default async function engineRoutes(app) {
  const { db, config } = app;
  const manager = { preHandler: requireRole('manager') };

  app.get('/engines', async (req, reply) => {
    const q = parse(listQuery, req.query);
    const w = new Where().raw("s.kind = 'genset' and s.active")
      .add('i.atoll_id = ?', q.atoll_id).add('i.id = ?', q.island_id)
      .add('(s.tag ilike ? or s.make_model ilike ? or i.name ilike ? or s.serial_no ilike ? or c.fault ilike ?)', q.q && `%${q.q}%`);
    if (q.condition === 'no_report') w.raw('c.asset_id is null');
    else if (q.condition === 'faults') w.raw("c.condition in ('minor_fault', 'major_fault', 'not_running')");
    else w.add('c.condition = ?', q.condition);
    if (q.flag === 'work') w.raw("exists (select 1 from work_orders x where x.asset_id = s.id and x.status not in ('completed', 'cancelled'))");
    const { rows } = await db.query(`${ENGINE_SELECT} ${w.sql} order by a.code, i.name, length(s.tag), s.tag`, w.values);

    const today = await mvToday(db, config.timezone);
    const expected = expectedMonth(today);
    let engines = rows.map((e) => describeEngine(e, today, expected));
    if (q.flag === 'overhaul') engines = engines.filter((e) => e.overhaul_due);
    if (q.flag === 'alternator') engines = engines.filter((e) => e.alt_service_due);
    if (q.flag === 'stale') engines = engines.filter((e) => e.report_stale);
    const by = {
      condition: (e) => CONDITION_RANK[e.condition] ?? 4,
      hours_since_overhaul: (e) => -(e.hours_since_overhaul ?? -1),
      total_hours: (e) => -(e.total_hours ?? -1),
      last_overhaul: (e) => e.last_overhaul_on || '0000',
    }[q.sort];
    if (by) engines.sort((a, b) => (by(a) < by(b) ? -1 : by(a) > by(b) ? 1 : 0));

    if (q.format === 'csv') {
      return sendCsv(reply, `engines_${today}.csv`, engines, [
        ['Atoll', 'atoll_code'], ['Island', 'island_name'], ['Genset', 'tag'], ['Make / model', 'make_model'],
        ['Serial', 'serial_no'], ['Rated kW', 'rated_capacity'], ['Status', 'status'], ['Report month', (e) => e.report_month?.slice(0, 7)],
        ['Condition', 'condition'], ['Report status', 'status_text'], ['Fault', 'fault'], ['Total hours', 'total_hours'],
        ['Hours since overhaul', 'hours_since_overhaul'], ['Last overhaul', 'last_overhaul_on'], ['Needs overhaul', 'needs_overhaul'],
        ['Next overhaul (hours)', 'next_overhaul_hours'], ['Next overhaul (date)', 'next_overhaul_on'],
        ['Last alternator service', 'last_alt_service_on'], ['Alternator needs service', 'alt_needs_service'],
        ['Next alternator service', 'next_alt_service_on'], ['Open work', (e) => e.open_work.map((x) => x.title).join('; ')],
      ]);
    }
    const count = (fn) => engines.filter(fn).length;
    return {
      today,
      expected_month: expected,
      summary: {
        total: engines.length,
        ok: count((e) => e.condition === 'ok'),
        minor_fault: count((e) => e.condition === 'minor_fault'),
        major_fault: count((e) => e.condition === 'major_fault'),
        not_running: count((e) => e.condition === 'not_running'),
        no_report: count((e) => !e.condition),
        overhaul_due: count((e) => e.overhaul_due),
        alt_service_due: count((e) => e.alt_service_due),
        with_work: count((e) => e.open_work.length),
      },
      engines,
    };
  });

  // Maintenance history: add a record by hand (reports and completed work add their own).
  app.post('/assets/:id/maintenance', manager, async (req, reply) => {
    const { id: assetId } = parse(idParam, req.params);
    const b = parse(eventBody, req.body);
    await assertIslandWrite(db, req.user, { assetId });
    const row = await db.tx(req.user.id, async (t) => one((await t.query(`
      insert into maintenance_events (asset_id, kind, done_on, running_hours, notes, source, created_by)
      values ($1, $2, $3, $4, $5, 'manual', $6)
      on conflict (asset_id, kind, done_on) do update
        set notes = coalesce(excluded.notes, maintenance_events.notes),
            running_hours = coalesce(excluded.running_hours, maintenance_events.running_hours)
      returning *`, [assetId, b.kind, b.done_on, b.running_hours ?? null, b.notes, req.user.id])).rows));
    reply.code(201);
    return row;
  });

  app.delete('/maintenance/:id', manager, async (req) => {
    const { id: eventId } = parse(serialParam, req.params);
    const event = one((await db.query('select * from maintenance_events where id = $1', [eventId])).rows, 'Record');
    await assertIslandWrite(db, req.user, { assetId: event.asset_id });
    if (event.source !== 'manual' && req.user.role !== 'admin') {
      throw forbidden('Records taken from reports or completed work can only be removed by an administrator');
    }
    await db.tx(req.user.id, (t) => t.query('delete from maintenance_events where id = $1', [eventId]));
    return { ok: true };
  });
}
