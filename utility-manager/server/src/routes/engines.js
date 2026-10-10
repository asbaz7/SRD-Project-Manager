import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { sendCsv } from '../csv.js';
import { badRequest, forbidden } from '../errors.js';
import { Where, date, id, idParam, one, optText, parse, serialParam, text } from '../http.js';
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
         (select e.running_hours from maintenance_events e where e.asset_id = s.id and e.kind in ('overhaul', 'top_overhaul')
           order by e.done_on desc limit 1) as last_overhaul_event_hours,
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
const addMonths = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

export async function loadIntervals(db) {
  return (await db.query('select model_match, overhaul_hours, alt_service_months from service_intervals')).rows;
}

// The intervals for one engine: the longest model match, blanks filled from
// the region's row.
export function intervalFor(intervals, makeModel) {
  const region = intervals.find((i) => i.model_match == null) || {};
  const model = String(makeModel || '').toUpperCase();
  const match = intervals.filter((i) => i.model_match && model.includes(i.model_match.toUpperCase()))
    .sort((a, b) => b.model_match.length - a.model_match.length)[0];
  const pick = (k) => (match?.[k] != null ? Number(match[k]) : region[k] != null ? Number(region[k]) : null);
  return { model_match: match?.model_match ?? null, overhaul_hours: pick('overhaul_hours'), alt_service_months: pick('alt_service_months') };
}

// Adds the figures people actually look for. Due = the island asked for it
// on its sheet (the tick), or it is due by rule: hours or a date set on the
// genset, else the last one plus the interval.
export function describeEngine(e, today, expected, intervals = []) {
  const work = typeof e.open_work === 'string' ? JSON.parse(e.open_work) : e.open_work;
  e.open_work = work || [];
  e.last_overhaul_on = maxDate(e.report_overhaul_on, e.last_overhaul_event);
  e.last_alt_service_on = maxDate(e.report_alt_service_on, e.last_alt_event);
  // Hours since overhaul only holds if no later overhaul was recorded.
  if (e.last_overhaul_event && e.report_overhaul_on && e.last_overhaul_event > e.report_overhaul_on) e.hours_since_overhaul = null;
  const iv = intervalFor(intervals, e.make_model);
  e.intervals = iv;
  // Hours run since the last overhaul: the report's figure, else from the
  // hours recorded at the last overhaul.
  let since = e.hours_since_overhaul;
  if (since == null && e.total_hours != null && e.last_overhaul_event_hours != null && e.last_overhaul_event === e.last_overhaul_on) {
    since = Math.max(0, e.total_hours - e.last_overhaul_event_hours);
  }
  if (e.next_overhaul_hours != null && e.total_hours != null) {
    e.hours_to_overhaul = Math.round(e.next_overhaul_hours - e.total_hours);
    e.overhaul_rule = 'set';
  } else if (iv.overhaul_hours && since != null) {
    e.hours_to_overhaul = Math.round(iv.overhaul_hours - since);
    e.overhaul_rule = 'interval';
  } else {
    e.hours_to_overhaul = null;
    e.overhaul_rule = null;
  }
  // A date set on the genset counts until a service after it is recorded.
  const overhaulBy = e.next_overhaul_on && !(e.last_overhaul_on && e.last_overhaul_on >= e.next_overhaul_on) ? e.next_overhaul_on : null;
  e.overhaul_requested = !!e.needs_overhaul;
  e.overhaul_due = !!(e.needs_overhaul || (e.hours_to_overhaul != null && e.hours_to_overhaul <= 0) || (overhaulBy && overhaulBy <= today));

  const altSet = e.next_alt_service_on && !(e.last_alt_service_on && e.last_alt_service_on >= e.next_alt_service_on) ? e.next_alt_service_on : null;
  e.next_alt_service_due = altSet || (e.last_alt_service_on && iv.alt_service_months ? addMonths(e.last_alt_service_on, iv.alt_service_months) : null);
  e.alt_service_rule = altSet ? 'set' : e.next_alt_service_due ? 'interval' : null;
  e.alt_requested = !!e.alt_needs_service;
  e.alt_service_due = !!(e.alt_needs_service || (e.next_alt_service_due && e.next_alt_service_due <= today));
  e.report_stale = !!e.report_month && e.report_month >= REPORTS_TRACKED_FROM && e.report_month < expected;
  delete e.total_count;
  return e;
}

// Overhaul / alternator service counts for the overview tiles, by the same
// rule as the engine list.
export async function dueCounts(db, today, atollId) {
  const [{ rows }, intervals] = await Promise.all([
    db.query(`${ENGINE_SELECT} where s.kind = 'genset' and s.active and s.status <> 'decommissioned'
                and ($1::uuid is null or i.atoll_id = $1)`, [atollId ?? null]),
    loadIntervals(db),
  ]);
  const expected = expectedMonth(today);
  const engines = rows.map((e) => describeEngine(e, today, expected, intervals));
  const count = (fn) => engines.filter(fn).length;
  return {
    overhaul_due: count((e) => e.overhaul_due), alt_service_due: count((e) => e.alt_service_due),
    overhaul_requested: count((e) => e.overhaul_requested), alt_requested: count((e) => e.alt_requested),
  };
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
  sort: z.enum(['island', 'condition', 'hours_since_overhaul', 'total_hours', 'last_overhaul', 'last_alt_service', 'next_service']).default('island'),
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
    const intervals = await loadIntervals(db);
    let engines = rows.map((e) => describeEngine(e, today, expected, intervals));
    if (q.flag === 'overhaul') engines = engines.filter((e) => e.overhaul_due);
    if (q.flag === 'alternator') engines = engines.filter((e) => e.alt_service_due);
    if (q.flag === 'stale') engines = engines.filter((e) => e.report_stale);
    const by = {
      condition: (e) => CONDITION_RANK[e.condition] ?? 4,
      hours_since_overhaul: (e) => -(e.hours_since_overhaul ?? -1),
      total_hours: (e) => -(e.total_hours ?? -1),
      last_overhaul: (e) => e.last_overhaul_on || '0000',
      last_alt_service: (e) => e.last_alt_service_on || '0000',
      // Soonest of the next alternator service and the next overhaul (hours
      // turned into a rough date at 500 h a month); unknown last.
      next_service: (e) => {
        const byHours = e.hours_to_overhaul != null ? addMonths(today, Math.floor(e.hours_to_overhaul / 500)) : null;
        return [e.next_alt_service_due, byHours].filter(Boolean).sort()[0] || '9999';
      },
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
        ['Next alternator service', 'next_alt_service_due'], ['Hours to overhaul', 'hours_to_overhaul'], ['Open work', (e) => e.open_work.map((x) => x.title).join('; ')],
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
        alt_requested: count((e) => e.alt_requested),
        overhaul_requested: count((e) => e.overhaul_requested),
        with_work: count((e) => e.open_work.length),
      },
      engines,
    };
  });

  // Service intervals: the region's, and any per engine model.
  app.get('/service-intervals', async () => {
    const { rows } = await db.query(`select v.*, u.full_name as updated_by_name from service_intervals v
                                       left join users u on u.id = v.updated_by order by v.model_match nulls first`);
    return { region: rows.find((r) => r.model_match == null) || null, models: rows.filter((r) => r.model_match != null) };
  });

  // Replaces them all. Technical managers and administrators.
  app.put('/service-intervals', manager, async (req) => {
    if (!req.user.technical) throw forbidden('Service intervals are set by technical staff');
    const hours = z.number().positive().max(200_000).nullish();
    const months = z.number().int().positive().max(240).nullish();
    const b = parse(z.object({
      region: z.object({ overhaul_hours: hours, alt_service_months: months }),
      models: z.array(z.object({ model_match: z.string().trim().min(2).max(60), overhaul_hours: hours, alt_service_months: months }))
        .max(100).default([]),
    }), req.body);
    const keys = b.models.map((m) => m.model_match.toUpperCase());
    if (new Set(keys).size !== keys.length) throw badRequest('Each model may appear only once');
    await db.tx(req.user.id, async (t) => {
      await t.query(`update service_intervals set overhaul_hours = $1, alt_service_months = $2, updated_by = $3, updated_at = now()
                      where model_match is null`, [b.region.overhaul_hours ?? null, b.region.alt_service_months ?? null, req.user.id]);
      await t.query('delete from service_intervals where model_match is not null and not (upper(model_match) = any($1::text[]))', [keys]);
      for (const m of b.models) {
        await t.query(`
          insert into service_intervals (model_match, overhaul_hours, alt_service_months, updated_by)
          values ($1, $2, $3, $4)
          on conflict (model_match) do update set overhaul_hours = excluded.overhaul_hours,
            alt_service_months = excluded.alt_service_months, updated_by = excluded.updated_by, updated_at = now()`,
        [m.model_match, m.overhaul_hours ?? null, m.alt_service_months ?? null, req.user.id]);
      }
    });
    const { rows } = await db.query('select * from service_intervals order by model_match nulls first');
    return { region: rows.find((r) => r.model_match == null), models: rows.filter((r) => r.model_match != null) };
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

  // Correcting a record. The reason is kept on it, so the audit trail shows
  // it with the change. Report records are what the sheet said (fix the
  // sheet, or an administrator removes them); a completed work order's record
  // takes its date, type and engine from the work order.
  app.patch('/maintenance/:id', manager, async (req) => {
    const { id: eventId } = parse(serialParam, req.params);
    const b = parse(eventBody.partial().extend({ reason: text(500) }), req.body);
    const event = one((await db.query('select * from maintenance_events where id = $1', [eventId])).rows, 'Record');
    await assertIslandWrite(db, req.user, { assetId: event.asset_id });
    if (event.source === 'report') throw forbidden('Records taken from a condition report cannot be edited');
    const fromWork = event.source === 'work' && event.work_id;
    if (fromWork && ((b.kind && b.kind !== event.kind) || (b.done_on && b.done_on !== event.done_on))) {
      throw badRequest(`The date and type come from WO-${String(event.work_id).padStart(4, '0')}. Edit the work order instead.`);
    }
    const next = {
      kind: b.kind ?? event.kind, done_on: b.done_on ?? event.done_on,
      running_hours: 'running_hours' in b ? b.running_hours ?? null : event.running_hours,
      notes: 'notes' in b ? b.notes : event.notes,
    };
    const clash = await db.query('select 1 from maintenance_events where asset_id = $1 and kind = $2 and done_on = $3 and id <> $4',
      [event.asset_id, next.kind, next.done_on, eventId]);
    if (clash.rows.length) throw badRequest('There is already a record of that type on that date for this engine');
    return db.tx(req.user.id, async (t) => one((await t.query(`
      update maintenance_events
         set kind = $2, done_on = $3, running_hours = $4, notes = $5, edit_reason = $6, edited_by = $7, edited_at = now()
       where id = $1 returning *`,
    [eventId, next.kind, next.done_on, next.running_hours, next.notes, b.reason, req.user.id])).rows));
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
