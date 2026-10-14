// A genset's monthly record: kept month by month per source (history,
// engine_reports / powerhouse_report_history) and the latest one per genset
// and powerhouse (engine_conditions / powerhouse_reports), which the engine
// views read (engine_current). Records come from the in-app monthly update
// (source 'update'); earlier ones came from workbooks ('upload') and from
// Fleet Manager ('fleet_manager') and stay as history.
import { clearFaults, noteFault } from './faults.js';

const STATUS_FOR = { not_running: 'down', major_fault: 'running', minor_fault: 'running', ok: 'running' };

function addMonths(month, n) {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

// One genset's figures for a month, named as the database names them.
export const REPORT_FIELDS = ['status_text', 'condition', 'fault', 'total_hours', 'hours_since_overhaul', 'last_overhaul_on',
  'hours_since_valve', 'last_valve_on', 'last_alt_service_on', 'last_battery_on', 'max_load_kw', 'capable_kw',
  'needs_overhaul', 'alt_needs_service', 'overhaul_spares_received'];

const values = (r) => REPORT_FIELDS.map((k) => r[k] ?? null);
const cols = REPORT_FIELDS.join(', ');
const params = (from) => REPORT_FIELDS.map((_, i) => `$${i + from}`).join(', ');
const assignAll = REPORT_FIELDS.map((k) => `${k} = excluded.${k}`).join(', ');

// Keeps one month of one genset's report, per source; sent again, it replaces.
export async function keepEngineReport(t, assetId, month, reportedOn, r, { source, sourceRef = null, userId }) {
  await t.query(`
    insert into engine_reports (asset_id, report_month, source, reported_on, source_ref, received_by, received_at, ${cols})
    values ($1, $2, $3, $4, $5, $6, now(), ${params(7)})
    on conflict (asset_id, report_month, source) do update set
      reported_on = excluded.reported_on, source_ref = excluded.source_ref, received_by = excluded.received_by,
      received_at = now(), ${assignAll}`,
  [assetId, month, source, reportedOn ?? null, sourceRef, userId, ...values(r)]);
}

export async function keepPowerhouseReport(t, facilityId, month, p) {
  await t.query(`
    insert into powerhouse_report_history (facility_id, report_month, source, reported_on, peak_load_kw, peak_load_at,
      peak_load_record, peak_load_month, genset_count, file_name, held_rows, source_ref, received_by, received_at)
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())
    on conflict (facility_id, report_month, source) do update set
      reported_on = excluded.reported_on, peak_load_kw = excluded.peak_load_kw, peak_load_at = excluded.peak_load_at,
      peak_load_record = excluded.peak_load_record, peak_load_month = excluded.peak_load_month,
      genset_count = excluded.genset_count, file_name = excluded.file_name, held_rows = excluded.held_rows,
      source_ref = excluded.source_ref, received_by = excluded.received_by, received_at = now()`,
  [facilityId, month, p.source, p.reported_on ?? null, p.peak_load_kw ?? null, p.peak_load_at ?? null,
    p.peak_load_record ?? null, p.peak_load_month ?? null, p.genset_count ?? null, p.file_name?.slice(0, 200) || null,
    p.held_rows?.length ? JSON.stringify(p.held_rows) : null, p.source_ref ?? null, p.userId]);
}

// Makes a month the genset's latest record, unless a newer month is already
// in; then records its running state when that is newer than the last status
// someone set, and different. A disconnected or retired genset keeps its
// status. `at`: when the record was made (default: the morning after the
// month, as for workbooks). Returns 1 if it became the latest.
const NOTE_PREFIX = { update: 'Monthly update', upload: 'Condition report', fleet_manager: 'Condition report' };
export async function setLatest(t, asset, month, reportedOn, r, { source, userId, at: when, setStatus = true }) {
  const { rowCount } = await t.query(`
    insert into engine_conditions (asset_id, report_month, reported_on, source, uploaded_by, updated_at, ${cols})
    values ($1, $2, $3, $4, $5, now(), ${params(6)})
    on conflict (asset_id) do update set
      report_month = excluded.report_month, reported_on = excluded.reported_on, source = excluded.source,
      uploaded_by = excluded.uploaded_by, updated_at = now(), ${assignAll}
    where engine_conditions.report_month <= excluded.report_month`,
  [asset.id, month, reportedOn ?? null, source, userId, ...values(r)]);
  const status = STATUS_FOR[r.condition];
  const at = when || `${reportedOn || addMonths(month, 1)}T08:00:00+05:00`;
  if (setStatus && rowCount && status && status !== asset.status && !['disconnected', 'decommissioned'].includes(asset.status)
      && (!asset.status_at || new Date(asset.status_at) < new Date(at))) {
    await t.query(`
      insert into asset_status_log (asset_id, status, note, reported_at, reported_by)
      values ($1, $2, $3, $4, $5)`,
    [asset.id, status, r.condition === 'ok' ? null : `${NOTE_PREFIX[source] || 'Condition report'} ${month.slice(0, 7)}: ${[r.status_text, r.fault].filter(Boolean).join(' — ')}`, at, userId]);
  }
  return rowCount;
}

export async function setLatestPowerhouse(t, facilityId, month, p) {
  const { rowCount } = await t.query(`
    insert into powerhouse_reports (facility_id, report_month, reported_on, peak_load_record, peak_load_month,
                                    genset_count, file_name, uploaded_by, uploaded_at, source, peak_load_kw, peak_load_at, held_rows)
    values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10, $11, $12)
    on conflict (facility_id) do update set
      report_month = excluded.report_month, reported_on = excluded.reported_on,
      peak_load_record = excluded.peak_load_record, peak_load_month = excluded.peak_load_month,
      genset_count = excluded.genset_count, file_name = excluded.file_name,
      uploaded_by = excluded.uploaded_by, uploaded_at = now(), source = excluded.source,
      peak_load_kw = excluded.peak_load_kw, peak_load_at = excluded.peak_load_at, held_rows = excluded.held_rows
    where powerhouse_reports.report_month <= excluded.report_month`,
  [facilityId, month, p.reported_on ?? null, p.peak_load_record ?? null, p.peak_load_month ?? null,
    p.genset_count ?? null, p.file_name?.slice(0, 200) || null, p.userId, p.source,
    p.peak_load_kw ?? null, p.peak_load_at ?? null, p.held_rows?.length ? JSON.stringify(p.held_rows) : null]);
  // Its first report: it reports from now on.
  await t.query('update facilities set reports_from = $2 where id = $1 and reports_from is null', [facilityId, month]);
  return rowCount;
}

// Powerhouses whose latest report is older than this are not chased as
// "missing" (their reporting stopped long ago and is handled separately).
export const REPORTS_TRACKED_FROM = '2024-01-01';

// `reportsFrom` is the first month the powerhouse is expected to report
// (facilities.reports_from); null = not surveyed yet, so not chased.
export function reportState(reportMonth, expected, reportsFrom) {
  if (reportMonth && reportMonth >= expected) return 'up_to_date';
  if (reportsFrom === null || (reportsFrom && reportsFrom > expected)) return 'not_expected';
  if (!reportMonth) return 'never';
  if (reportMonth < REPORTS_TRACKED_FROM) return 'untracked';
  return 'missing';
}
export const isMissing = (state) => state === 'missing' || state === 'never';

/**
 * Which month's report every powerhouse should have sent by `today`
 * (Maldives date, 'YYYY-MM-DD'): last month's, once the 10th has passed.
 */
export function expectedMonth(today, dueDay = 10) {
  const [y, m, d] = today.split('-').map(Number);
  const back = d > dueDay ? 1 : 2;
  const date = new Date(Date.UTC(y, m - 1 - back, 1));
  return date.toISOString().slice(0, 10);
}

// --- The in-app monthly update ------------------------------------------------

const CONDITION_TEXT = { ok: 'RUNNING; OK', minor_fault: 'RUNNING; MINOR FAULT', major_fault: 'RUNNING; MAJOR FAULT', not_running: 'NOT RUNNING' };
// The old single "condition" (still accepted from Telegram and the assistant):
// its fault level, and the status it implies.
const FROM_CONDITION = { ok: ['none'], minor_fault: ['minor'], major_fault: ['major'], not_running: [undefined, 'down'] };
// For counts and the monthly history: status and faults in one word.
export const conditionOf = (status, level) => (['down', 'maintenance'].includes(status) ? 'not_running'
  : { major: 'major_fault', minor: 'minor_fault', none: 'ok' }[level] ?? null);

/**
 * What an update item changes on a genset: its status, and its faults. A
 * genset can have several faults (migration 060): none clears them all; a
 * level with what is wrong adds that fault (the same words as an open one
 * are that one). Left out, they stay as they are. Coming back into service
 * clears the faults first (as a status change does). level / note: the
 * level and description given, to check a fault is described.
 */
export function resolveItem(it, cur) {
  let status = it.status;
  let level = it.fault_level;
  if (it.condition) {
    const [l, s] = FROM_CONDITION[it.condition];
    level ??= l;
    if (s) status ??= s;
    else if (status === undefined && ['down', 'maintenance'].includes(cur.status)) status = 'running';
    if (it.condition === 'not_running' && it.fault && level === undefined) level = 'major';
  }
  // A status implied by a condition word doesn't change a disconnected or
  // retired genset; one chosen on the form does.
  if (status !== undefined && it.status === undefined && ['disconnected', 'decommissioned'].includes(cur.status)) status = undefined;
  const newStatus = status ?? cur.status;
  const backInService = ['down', 'maintenance'].includes(cur.status) && ['running', 'standby'].includes(newStatus);
  const open = ['minor', 'major'].includes(cur.fault_level);
  const clear = level === 'none' || (backInService && open);
  // A level with no words, the same as now (e.g. "minor fault" again on
  // Telegram): the faults it has. Otherwise a fault needs its description.
  const keep = level !== undefined && level !== 'none' && !it.fault && !clear && level === cur.fault_level;
  const add = level && level !== 'none' && !keep ? { level, note: it.fault ?? null } : null;
  return { status: newStatus, statusChanged: newStatus !== cur.status, clear: clear && open, add,
    level: level ?? (backInService ? 'none' : cur.fault_level ?? null), note: add ? add.note : clear ? null : cur.fault_note ?? null };
}

// Hours since a service, carried forward: the last figure plus the hours run
// since, unless that service was done again after the last record (then from
// the hours recorded with it, if any) or the meter was replaced (unknown).
function since(prev, total, metered, done) {
  if (done) return done.running_hours != null && total >= Number(done.running_hours) ? Math.round(total - Number(done.running_hours)) : null;
  if (!metered || prev?.since == null || prev.total == null) return null;
  return Math.round(Number(prev.since) + (total - Number(prev.total)));
}

/**
 * A powerhouse's monthly update, entered in the app: for each genset its
 * running hours, and if given its status, faults (level and description) and
 * whether it needs an overhaul or an alternator service. Service dates and
 * the hours since them carry forward from the last record (and from
 * maintenance records added since), so due dates keep working. Status and
 * faults are the genset's own (assets); the month's figures are kept in the
 * history and made the latest. The powerhouse counts as updated for the
 * month once every genset in use (not disconnected) has its figures.
 * items: [{ asset, total_hours, meter_replaced, status, fault_level, fault, condition, needs_overhaul, alt_needs_service }]
 */
export async function applyGensetUpdate(t, { facilityId, items, userId, today }) {
  const month = `${today.slice(0, 7)}-01`;
  const at = new Date().toISOString();
  for (const it of items) {
    const { rows: [cur] } = await t.query('select id, status, status_at, fault_level, fault_note from assets where id = $1', [it.asset.id]);
    const { rows: [prev] } = await t.query('select * from engine_conditions where asset_id = $1', [it.asset.id]);
    const x = resolveItem(it, cur);
    if (x.clear) {
      await clearFaults(t, it.asset.id, { reason: x.statusChanged && !x.add ? 'Back in service (monthly update)' : 'Monthly update', userId });
    }
    if (x.add) await noteFault(t, it.asset.id, { ...x.add, userId });
    // No faults, said of a genset with none recorded yet: it has none.
    if (x.level === 'none' && !x.clear) {
      await t.query("update assets set fault_level = 'none', fault_note = null, fault_at = now(), fault_by = $2 where id = $1 and fault_level is null", [it.asset.id, userId]);
    }
    // The genset's faults now, all of them, for the month's record.
    const { rows: [now] } = await t.query('select fault_level, fault_note from assets where id = $1', [it.asset.id]);
    const condition = conditionOf(x.status, now.fault_level) ?? prev?.condition ?? null;
    if (x.statusChanged) {
      await t.query(`insert into asset_status_log (asset_id, status, note, reported_at, reported_by) values ($1, $2, $3, $4, $5)`,
        [it.asset.id, x.status, ['running', 'standby'].includes(x.status) ? null
          : `Monthly update ${month.slice(0, 7)}: ${[CONDITION_TEXT[condition] || x.status, x.note].filter(Boolean).join(' — ')}`, at, userId]);
    }
    const after = prev?.reported_on || (prev ? addMonths(prev.report_month, 1) : null);
    const { rows: done } = await t.query(`
      select distinct on (kind in ('overhaul', 'top_overhaul')) kind, done_on, running_hours from maintenance_events
       where asset_id = $1 and kind in ('overhaul', 'top_overhaul', 'valve_clearance') and ($2::date is null or done_on >= $2)
       order by kind in ('overhaul', 'top_overhaul'), done_on desc`, [it.asset.id, after]);
    const overhaul = done.find((e) => e.kind !== 'valve_clearance');
    const valve = done.find((e) => e.kind === 'valve_clearance');
    const metered = !it.meter_replaced;
    const r = {
      status_text: CONDITION_TEXT[condition] ?? null,
      condition,
      fault: now.fault_level === 'none' ? null : now.fault_note,
      total_hours: it.total_hours,
      hours_since_overhaul: since({ since: prev?.hours_since_overhaul, total: prev?.total_hours }, it.total_hours, metered, overhaul),
      last_overhaul_on: prev?.last_overhaul_on ?? null,
      hours_since_valve: since({ since: prev?.hours_since_valve, total: prev?.total_hours }, it.total_hours, metered, valve),
      last_valve_on: prev?.last_valve_on ?? null,
      last_alt_service_on: prev?.last_alt_service_on ?? null,
      last_battery_on: prev?.last_battery_on ?? null,
      max_load_kw: prev?.max_load_kw ?? null,
      capable_kw: prev?.capable_kw ?? null,
      needs_overhaul: it.needs_overhaul ?? prev?.needs_overhaul ?? false,
      alt_needs_service: it.alt_needs_service ?? prev?.alt_needs_service ?? false,
      overhaul_spares_received: prev?.overhaul_spares_received ?? null,
    };
    const opts = { source: 'update', userId, sourceRef: it.meter_replaced ? 'meter replaced' : null, at, setStatus: false };
    await keepEngineReport(t, it.asset.id, month, today, r, opts);
    await setLatest(t, it.asset, month, today, r, opts);
    await t.query(`insert into hours_log (asset_id, month, total_hours) values ($1, $2, $3)
                   on conflict (asset_id, month) do update set total_hours = excluded.total_hours`, [it.asset.id, month, it.total_hours]);
  }
  // The powerhouse is up to date for the month once all its gensets are.
  const { rows: [count] } = await t.query(`
    select count(*) filter (where c.report_month >= $2)::int as done,
           count(*) filter (where c.report_month is null or c.report_month < $2)::int as left,
           coalesce(array_agg(s.tag order by length(s.tag), s.tag) filter (where c.report_month is null or c.report_month < $2), '{}') as due
      from assets s left join engine_conditions c on c.asset_id = s.id
     where s.facility_id = $1 and s.kind = 'genset' and s.active and s.status not in ('decommissioned', 'disconnected')`, [facilityId, month]);
  const due = typeof count.due === 'string' ? count.due.replace(/[{}"]/g, '').split(',').filter(Boolean) : count.due;
  if (!count.left) {
    const p = { source: 'update', reported_on: today, genset_count: count.done, userId };
    await keepPowerhouseReport(t, facilityId, month, p);
    await setLatestPowerhouse(t, facilityId, month, p);
  }
  return { month, gensets: items.length, complete: !count.left, still_due: due };
}
