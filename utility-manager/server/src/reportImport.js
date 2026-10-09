// Turns a parsed engine condition report into database changes:
//   - finds the island it belongs to (report spellings vary),
//   - keeps only the latest condition per genset and per powerhouse,
//   - writes every dated maintenance event it contains into the history,
//   - fills the genset register (make, serials, alternator) from the report.

const ATOLL_ALIASES = { AA: 'AA', ADH: 'ADh', K: 'K', T: 'K', M: 'M', V: 'V' };
const letters = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');

function distance(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length];
}

// 'AA. FERIDHOO', 'K.GAAFARU', 'M.MULI', 'BODUFOLHUDHOO' -> { atoll, name }
function splitName(text) {
  const s = String(text || '').toUpperCase().replace(/POWER\s*HOUSE|ENGINE CONDITION REPORTS?|\d{4}/g, ' ').trim();
  const m = s.match(/^(AA|ADH|K|T|M|V)\s*[.\s]\s*(.+)$/);
  return m ? { atoll: ATOLL_ALIASES[m[1]], name: letters(m[2]) } : { atoll: null, name: letters(s) };
}

/**
 * Finds the island for a report from the powerhouse name in the sheet, then
 * the file name. Returns { island, candidates }.
 */
export function matchIsland(islands, ...texts) {
  for (const text of texts.filter(Boolean)) {
    const { atoll, name } = splitName(text);
    if (name.length < 3) continue;
    const scored = islands
      .map((i) => {
        const target = letters(i.name);
        let d = distance(name, target);
        if (name.includes(target) || target.includes(name)) d = Math.min(d, Math.abs(name.length - target.length) ? 1 : 0);
        return { ...i, d: d + (atoll && atoll !== i.atoll_code ? 2 : 0) };
      })
      .sort((a, b) => a.d - b.d);
    const best = scored[0];
    const limit = Math.max(2, Math.floor(letters(best?.name).length * 0.2));
    if (best && best.d <= limit && (scored.length < 2 || scored[1].d > best.d)) {
      return { island: strip(best), candidates: [] };
    }
    const near = scored.filter((s) => s.d <= limit + 2).slice(0, 5).map(strip);
    if (near.length) return { island: null, candidates: near };
  }
  return { island: null, candidates: [] };
}
const strip = ({ d, ...i }) => i;

const STATUS_FOR = { not_running: 'down', major_fault: 'running', minor_fault: 'running', ok: 'running' };
const EVENT_FIELDS = [
  ['overhaul_on', 'overhaul'],
  ['alt_serviced_on', 'alternator_service'],
  ['valve_on', 'valve_clearance'],
  ['battery_changed_on', 'battery_change'],
];

// Events found in every month of the workbook, de-duplicated. A date later
// than the report it appears in is a typo and is skipped.
export function eventsFrom(parsed) {
  const events = new Map();
  for (const report of parsed.reports) {
    const limit = report.month ? addMonths(report.month, 2) : '2100-01-01';
    for (const g of report.gensets) {
      for (const [field, kind] of EVENT_FIELDS) {
        const day = g[field];
        if (!day || day > limit || day < '1990-01-01') continue;
        const key = `${g.number}|${kind}|${day}`;
        let hours = null;
        if (kind === 'overhaul') {
          if (g.overhaul_hours != null) hours = Math.round(g.overhaul_hours);
          else if (g.total_hours != null && g.hours_since_overhaul != null && g.total_hours >= g.hours_since_overhaul) {
            hours = Math.round(g.total_hours - g.hours_since_overhaul);
          }
        }
        if (kind === 'valve_clearance') {
          if (g.valve_hours != null) hours = Math.round(g.valve_hours);
          else if (g.total_hours != null && g.hours_since_valve != null && g.total_hours >= g.hours_since_valve) {
            hours = Math.round(g.total_hours - g.hours_since_valve);
          }
        }
        const prev = events.get(key);
        if (!prev || (prev.running_hours == null && hours != null)) events.set(key, { number: g.number, kind, done_on: day, running_hours: hours });
      }
    }
  }
  return [...events.values()];
}

function addMonths(month, n) {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

async function powerhouseOf(t, islandId) {
  const { rows } = await t.query(`
    select id from facilities
     where island_id = $1 and service = 'electricity' and kind = 'powerhouse'
     order by active desc, created_at limit 1`, [islandId]);
  return rows[0]?.id || null;
}

/**
 * What an upload would change, without changing anything.
 */
import { gensetBySerial, moveAsset, normSerial } from './assetMoves.js';

const NO_FACILITY = '00000000-0000-0000-0000-000000000000';

// Gensets in the report that are registered at another powerhouse (same
// serial number): moved here. Either under a number this powerhouse doesn't
// have, or replacing the genset registered under that number.
async function detectMoves(db, gensets, byTag, facilityId) {
  const moves = [];
  const serialChanges = [];
  for (const g of gensets) {
    const here = byTag.get(g.number);
    const reportSerial = normSerial(g.serial_no);
    if (here && (!reportSerial || normSerial(here.serial_no) === reportSerial)) continue;
    // Corrected by hand: the register is right and the report is not.
    if (here?.serial_locked) {
      serialChanges.push({ number: g.number, was: here.serial_no, now: g.serial_no, locked: true });
      continue;
    }
    const from = await gensetBySerial(db, g.serial_no, facilityId || NO_FACILITY);
    if (from) moves.push({ number: g.number, serial: g.serial_no, from, replaces: here || null });
    else if (here && normSerial(here.serial_no)) serialChanges.push({ number: g.number, was: here.serial_no, now: g.serial_no });
  }
  return { moves, serialChanges };
}

const monthLabel = (m) => new Date(`${m}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export async function planImport(db, parsed, islandId) {
  const facilityId = await powerhouseOf(db, islandId);
  const [{ rows: assets }, { rows: current }] = await Promise.all([
    facilityId
      ? db.query(`select a.id, a.tag, a.make_model, a.serial_no, a.serial_locked, c.report_month
                    from assets a left join engine_conditions c on c.asset_id = a.id
                   where a.facility_id = $1 and a.kind = 'genset' and a.active`, [facilityId])
      : { rows: [] },
    facilityId ? db.query('select report_month from powerhouse_reports where facility_id = $1', [facilityId]) : { rows: [] },
  ]);
  const byTag = new Map(assets.map((a) => [a.tag, a]));
  const ids = assets.map((a) => a.id);
  const { rows: known } = ids.length
    ? await db.query('select asset_id, kind, done_on from maintenance_events where asset_id = any($1::uuid[])', [ids])
    : { rows: [] };
  const knownKeys = new Set(known.map((e) => `${e.asset_id}|${e.kind}|${e.done_on}`));
  const events = eventsFrom(parsed).filter((e) => {
    const a = byTag.get(e.number);
    return !a || !knownKeys.has(`${a.id}|${e.kind}|${e.done_on}`);
  });

  const latest = parsed.latest;
  const currentMonth = current[0]?.report_month || null;
  const warnings = [];
  if (!latest.month) warnings.push('Could not tell which month this report is for.');
  if (currentMonth && latest.month && latest.month < currentMonth) {
    warnings.push(`A newer report (${currentMonth.slice(0, 7)}) is already in the system: only its history will be added.`);
  }
  if (currentMonth && latest.month && latest.month === currentMonth) {
    warnings.push(`This file's latest report (${monthLabel(latest.month)}) is the one already in the system: nothing newer was found in it.`);
  }
  if (parsed.skipped?.length) {
    warnings.push(`Could not read ${parsed.skipped.length === 1 ? 'sheet' : 'sheets'} ${parsed.skipped.map((s) => `"${s}"`).join(', ')}: the genset numbers row is missing. Check the template and upload again.`);
  }
  const relabelled = parsed.reports.filter((r) => r.number_label_missing).map((r) => r.sheet);
  if (relabelled.length) {
    warnings.push(`The "GENSET NO." label is missing on ${relabelled.length === 1 ? 'sheet' : 'sheets'} ${relabelled.map((s) => `"${s}"`).join(', ')}; the genset numbers were read from the row above "FIXED ASSET CODE". Please ask the island to fix the label.`);
  }
  const expected = expectedMonth(new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Maldives' }));
  if (latest.month && latest.month < expected && (!currentMonth || latest.month >= currentMonth)) {
    warnings.push(`The newest report in this file is ${monthLabel(latest.month)}; ${monthLabel(expected)} will still show as missing.`);
  }
  const { moves, serialChanges } = await detectMoves(db, latest.gensets, byTag, facilityId);
  const moved = new Map(moves.map((m) => [m.number, m]));
  for (const m of moves) {
    warnings.push(`Genset ${m.number} (S/N ${m.serial}) is registered at ${m.from.atoll_code}. ${m.from.island_name} as Genset ${m.from.tag}: it will be moved here with its history${
      m.replaces ? `, and the genset previously registered here as Genset ${m.number} (S/N ${m.replaces.serial_no}) will be marked as removed` : ''}.`);
  }
  for (const c of serialChanges) {
    warnings.push(c.locked
      ? `The report gives Genset ${c.number}'s serial number as ${c.now}, but it was corrected to ${c.was} in the register, which is kept. Please ask the island to fix its report.`
      : `Genset ${c.number}'s serial number changed from ${c.was} to ${c.now}. If the engine was replaced, record the old one's move or removal on its page.`);
  }
  const newGensets = latest.gensets.filter((g) => !byTag.has(g.number) && !moved.has(g.number)).map((g) => g.number);
  if (newGensets.length) warnings.push(`Genset${newGensets.length > 1 ? 's' : ''} ${newGensets.join(', ')} will be added to the register.`);

  return {
    report_month: latest.month,
    reported_on: latest.updated_on,
    current_month: currentMonth,
    months: parsed.reports.map((r) => r.month).filter(Boolean),
    newer: !currentMonth || (latest.month && latest.month >= currentMonth),
    new_events: events.length,
    events_by_kind: events.reduce((acc, e) => ({ ...acc, [e.kind]: (acc[e.kind] || 0) + 1 }), {}),
    warnings,
    moves: moves.map((m) => ({ number: m.number, from: `${m.from.atoll_code}. ${m.from.island_name} G${m.from.tag}` })),
    gensets: latest.gensets.map((g) => ({
      number: g.number,
      exists: byTag.has(g.number),
      moved_from: moved.has(g.number) ? `${moved.get(g.number).from.atoll_code}. ${moved.get(g.number).from.island_name} G${moved.get(g.number).from.tag}` : null,
      make_model: [g.make, g.model].filter(Boolean).join(' ') || byTag.get(g.number)?.make_model || null,
      status_text: g.status_text || null,
      condition: g.condition || null,
      fault: g.fault || null,
      total_hours: g.total_hours ?? null,
      hours_since_overhaul: g.hours_since_overhaul ?? null,
      last_overhaul_on: g.overhaul_on || null,
      last_alt_service_on: g.alt_serviced_on || null,
      needs_overhaul: g.needs_overhaul ?? null,
      alt_needs_service: g.alt_needs_service ?? null,
    })),
  };
}

/**
 * Applies an upload inside transaction t. Returns counts.
 */
export async function applyImport(t, parsed, { islandId, userId, fileName }) {
  let facilityId = await powerhouseOf(t, islandId);
  if (!facilityId) {
    facilityId = (await t.query(`
      insert into facilities (island_id, service, kind, name)
      select id, 'electricity', 'powerhouse', name || ' Powerhouse' from islands where id = $1
      returning id`, [islandId])).rows[0].id;
  }
  const latest = parsed.latest;
  const { rows: existing } = await t.query(
    "select id, tag, status, status_at, serial_no, serial_locked from assets where facility_id = $1 and kind = 'genset' and active", [facilityId]);
  const byTag = new Map(existing.map((a) => [a.tag, a]));
  let created = 0;

  // Gensets moved here from another powerhouse keep their record and history.
  const { moves } = await detectMoves(t, latest.gensets, byTag, facilityId);
  const movedOn = latest.updated_on || addMonths(latest.month, 1);
  for (const m of moves) {
    if (m.replaces) {
      // The genset registered here under this number has gone (where to is
      // not in this report): keep its record, out of use, under a free tag.
      const oldTag = `${m.number} (removed ${movedOn.slice(0, 7)})`;
      await t.query("update assets set active = false, tag = $2 where id = $1", [m.replaces.id, oldTag]);
      await t.query(`insert into asset_status_log (asset_id, status, note, reported_at, reported_by)
                     values ($1, 'decommissioned', $2, now(), $3)`,
      [m.replaces.id, `Replaced by S/N ${m.serial} (moved from ${m.from.atoll_code}. ${m.from.island_name}) per the ${latest.month?.slice(0, 7)} report. Record where it went if known.`, userId]);
    }
    // Every move is tracked as work: complete the open move if there is one,
    // otherwise record a completed one.
    const note = `Found in the ${latest.month?.slice(0, 7)} condition report${fileName ? ` (${fileName})` : ''}`;
    const { rows: open } = await t.query(`select id from work_orders where asset_id = $1 and kind = 'relocation'
                                            and status not in ('completed', 'cancelled')`, [m.from.id]);
    let workId;
    if (open[0]) {
      workId = open[0].id;
      await t.query(`update work_orders set status = 'completed', completed_on = $2, dest_facility_id = $3, dest_tag = $4 where id = $1`,
        [workId, movedOn, facilityId, m.number]);
      await t.query(`insert into work_updates (work_id, body, created_by) values ($1, $2, $3)`, [workId, `${note}: completed.`, userId]);
    } else {
      const { rows: [from] } = await t.query('select island_id from facilities where id = $1', [m.from.facility_id]);
      const { rows: [here] } = await t.query(`select i.name, a.code from islands i join atolls a on a.id = i.atoll_id where i.id = $1`, [islandId]);
      workId = (await t.query(`
        insert into work_orders (island_id, facility_id, asset_id, kind, title, description, status, completed_on,
                                 created_by, service, dest_facility_id, dest_tag)
        values ($1, $2, $3, 'relocation', $4, $5, 'completed', $6, $7, 'electricity', $8, $9) returning id`,
      [from.island_id, m.from.facility_id, m.from.id,
        `Move Genset ${m.from.tag} from ${m.from.atoll_code}. ${m.from.island_name} to ${here.code}. ${here.name}`,
        `${note}. Recorded automatically.`, movedOn, userId, facilityId, m.number])).rows[0].id;
    }
    await moveAsset(t, { assetId: m.from.id, facilityId, tag: m.number, movedOn, source: 'report', userId, workId, notes: note });
    const { rows } = await t.query('select id, tag, status, status_at, serial_no, serial_locked from assets where id = $1', [m.from.id]);
    byTag.set(m.number, rows[0]);
  }

  // Register: every genset in the latest report, with what the report knows.
  for (const g of latest.gensets) {
    const makeModel = [g.make, g.model].filter(Boolean).join(' ') || null;
    const values = [makeModel, g.serial_no ?? null, g.engine_kw ?? null, g.capable_kw ?? null, g.fixed_asset_code ?? null,
      g.cpl ?? null, g.alt_make ?? null, g.alt_frame ?? null, g.alt_serial ?? null, g.alt_kw ?? null,
      g.installed_on || g.commissioned_on || null, g.connected ?? null];
    if (byTag.has(g.number)) {
      await t.query(`
        update assets set
          make_model = coalesce($2, make_model), serial_no = case when serial_locked then serial_no else coalesce($3, serial_no) end,
          rated_capacity = coalesce($4, rated_capacity), operating_capacity = coalesce($5, operating_capacity),
          fixed_asset_code = coalesce($6, fixed_asset_code), cpl_spec = coalesce($7, cpl_spec),
          alt_make = coalesce($8, alt_make), alt_frame = coalesce($9, alt_frame), alt_serial = coalesce($10, alt_serial),
          alt_kw = coalesce($11, alt_kw), commissioned_on = coalesce($12, commissioned_on),
          connected_to_panel = coalesce($13, connected_to_panel)
        where id = $1`, [byTag.get(g.number).id, ...values]);
    } else {
      const { rows } = await t.query(`
        insert into assets (facility_id, kind, tag, capacity_unit, make_model, serial_no, rated_capacity, operating_capacity,
                            fixed_asset_code, cpl_spec, alt_make, alt_frame, alt_serial, alt_kw, commissioned_on, connected_to_panel)
        values ($1, 'genset', $2, 'kW', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        returning id, tag, status, status_at`, [facilityId, g.number, ...values]);
      byTag.set(g.number, rows[0]);
      created++;
    }
  }

  // Maintenance history from every month in the workbook.
  let events = 0;
  for (const e of eventsFrom(parsed)) {
    const asset = byTag.get(e.number);
    if (!asset) continue;
    const { rows } = await t.query(`
      insert into maintenance_events (asset_id, kind, done_on, running_hours, source, origin, created_by)
      values ($1, $2, $3, $4, 'report', 'upload', $5)
      on conflict (asset_id, kind, done_on) do update
        set running_hours = coalesce(maintenance_events.running_hours, excluded.running_hours)
        where maintenance_events.running_hours is null and excluded.running_hours is not null
      returning (xmax = 0) as inserted`, [asset.id, e.kind, e.done_on, e.running_hours, userId]);
    events += rows.filter((r) => r.inserted).length;
  }

  // Running hours per month.
  for (const report of parsed.reports) {
    if (!report.month) continue;
    for (const g of report.gensets) {
      const asset = byTag.get(g.number);
      if (!asset || g.total_hours == null) continue;
      await t.query(`
        insert into hours_log (asset_id, month, total_hours) values ($1, $2, $3)
        on conflict (asset_id, month) do update set total_hours = excluded.total_hours`, [asset.id, report.month, g.total_hours]);
    }
  }

  // Every month in the workbook goes into the report history.
  for (const report of parsed.reports) {
    if (!report.month) continue;
    for (const g of report.gensets) {
      const asset = byTag.get(g.number);
      if (asset) await keepEngineReport(t, asset.id, report.month, report.updated_on, fromSheet(g), { source: 'upload', userId });
    }
    await keepPowerhouseReport(t, facilityId, report.month, {
      source: 'upload', userId, reported_on: report.updated_on, peak_load_record: report.peak_load_record,
      peak_load_month: report.peak_load_month, genset_count: report.gensets.length, file_name: fileName,
    });
  }

  // Latest condition, only if this report is not older than what we have.
  let updated = 0;
  if (latest.month) {
    for (const g of latest.gensets) {
      updated += await setLatest(t, byTag.get(g.number), latest.month, latest.updated_on, fromSheet(g), { source: 'upload', userId });
    }
    await setLatestPowerhouse(t, facilityId, latest.month, {
      source: 'upload', userId, reported_on: latest.updated_on, peak_load_record: latest.peak_load_record,
      peak_load_month: latest.peak_load_month, genset_count: latest.gensets.length, file_name: fileName,
    });
  }
  return { gensets_updated: updated, gensets_added: created, gensets_moved: moves.length, events_added: events };
}

// One genset's figures for a month, named as the database names them.
export const REPORT_FIELDS = ['status_text', 'condition', 'fault', 'total_hours', 'hours_since_overhaul', 'last_overhaul_on',
  'hours_since_valve', 'last_valve_on', 'last_alt_service_on', 'last_battery_on', 'max_load_kw', 'capable_kw',
  'needs_overhaul', 'alt_needs_service', 'overhaul_spares_received'];

const fromSheet = (g) => ({
  status_text: g.status_text, condition: g.condition, fault: g.fault, total_hours: g.total_hours,
  hours_since_overhaul: g.hours_since_overhaul, last_overhaul_on: g.overhaul_on, hours_since_valve: g.hours_since_valve,
  last_valve_on: g.valve_on, last_alt_service_on: g.alt_serviced_on, last_battery_on: g.battery_changed_on,
  max_load_kw: g.max_load_kw, capable_kw: g.capable_kw, needs_overhaul: g.needs_overhaul,
  alt_needs_service: g.alt_needs_service, overhaul_spares_received: g.overhaul_spares_received,
});
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

// Makes a month the genset's latest report, unless a newer month is already
// in; then records its running state when that is newer than the last status
// someone set, and different. Returns 1 if it became the latest.
export async function setLatest(t, asset, month, reportedOn, r, { source, userId }) {
  const { rowCount } = await t.query(`
    insert into engine_conditions (asset_id, report_month, reported_on, source, uploaded_by, updated_at, ${cols})
    values ($1, $2, $3, $4, $5, now(), ${params(6)})
    on conflict (asset_id) do update set
      report_month = excluded.report_month, reported_on = excluded.reported_on, source = excluded.source,
      uploaded_by = excluded.uploaded_by, updated_at = now(), ${assignAll}
    where engine_conditions.report_month <= excluded.report_month`,
  [asset.id, month, reportedOn ?? null, source, userId, ...values(r)]);
  const status = STATUS_FOR[r.condition];
  const at = `${reportedOn || addMonths(month, 1)}T08:00:00+05:00`;
  if (rowCount && status && status !== asset.status && (!asset.status_at || new Date(asset.status_at) < new Date(at))) {
    await t.query(`
      insert into asset_status_log (asset_id, status, note, reported_at, reported_by)
      values ($1, $2, $3, $4, $5)`,
    [asset.id, status, r.condition === 'ok' ? null : `Condition report ${month.slice(0, 7)}: ${[r.status_text, r.fault].filter(Boolean).join(' — ')}`, at, userId]);
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
  return rowCount;
}

// Powerhouses whose latest report is older than this are not chased as
// "missing" (their reporting stopped long ago and is handled separately).
export const REPORTS_TRACKED_FROM = '2024-01-01';

export function reportState(reportMonth, expected) {
  if (!reportMonth) return 'never';
  if (reportMonth < REPORTS_TRACKED_FROM) return 'untracked';
  return reportMonth >= expected ? 'up_to_date' : 'missing';
}

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

const DIFF_FIELDS = ['condition', 'total_hours', 'last_overhaul_on', 'last_valve_on', 'last_alt_service_on', 'last_battery_on',
  'needs_overhaul', 'alt_needs_service'];
const same = (a, b) => (a ?? null) === (b ?? null) || (a != null && b != null && Number(a) === Number(b) && !Number.isNaN(Number(a)));

/**
 * A powerhouse's monthly report as checked and sent by Fleet Manager
 * (genset ids already linked). Kept in the history next to any upload of
 * the same month; becomes the latest unless a newer month is in. Dates it
 * carries go into the maintenance history. Returns counts, and where it
 * differs from an uploaded sheet of the same month.
 */
export async function applyFleetReport(t, b, { facilityId, assets, userId }) {
  const month = b.report_month;
  const opts = { source: 'fleet_manager', sourceRef: b.source_ref ?? null, userId };
  let updated = 0;
  let events = 0;
  const differences = [];
  for (const e of b.engines) {
    const asset = assets.get(e.srd_asset_id);
    await keepEngineReport(t, asset.id, month, b.reported_on, e, opts);
    updated += await setLatest(t, asset, month, b.reported_on, e, opts);
    if (e.total_hours != null) {
      await t.query(`insert into hours_log (asset_id, month, total_hours) values ($1, $2, $3)
                     on conflict (asset_id, month) do update set total_hours = excluded.total_hours`, [asset.id, month, e.total_hours]);
    }
    for (const [field, kind, since] of [['last_overhaul_on', 'overhaul', 'hours_since_overhaul'], ['last_alt_service_on', 'alternator_service'],
      ['last_valve_on', 'valve_clearance', 'hours_since_valve'], ['last_battery_on', 'battery_change']]) {
      const day = e[field];
      if (!day || day > addMonths(month, 2)) continue;
      const hours = since && e.total_hours != null && e[since] != null && e.total_hours >= e[since] ? Math.round(e.total_hours - e[since]) : null;
      const { rows } = await t.query(`
        insert into maintenance_events (asset_id, kind, done_on, running_hours, source, origin, created_by)
        values ($1, $2, $3, $4, 'report', 'fleet_manager', $5)
        on conflict (asset_id, kind, done_on) do update
          set running_hours = coalesce(maintenance_events.running_hours, excluded.running_hours)
          where maintenance_events.running_hours is null and excluded.running_hours is not null
        returning (xmax = 0) as inserted`, [asset.id, kind, day, hours, userId]);
      events += rows.filter((r) => r.inserted).length;
    }
    const { rows: [up] } = await t.query(
      "select * from engine_reports where asset_id = $1 and report_month = $2 and source = 'upload'", [asset.id, month]);
    const fields = up ? DIFF_FIELDS.filter((k) => !same(up[k], e[k])) : [];
    if (fields.length) {
      differences.push({ srd_asset_id: asset.id, tag: asset.tag,
        fields: Object.fromEntries(fields.map((k) => [k, { upload: up[k] ?? null, fleet_manager: e[k] ?? null }])) });
    }
  }
  const p = {
    ...opts, reported_on: b.reported_on, peak_load_kw: b.peak_load?.kw, peak_load_at: b.peak_load?.at,
    genset_count: b.engines.length, file_name: b.file_name, held_rows: b.held_rows,
  };
  await keepPowerhouseReport(t, facilityId, month, p);
  const latest = await setLatestPowerhouse(t, facilityId, month, p);
  return { latest: !!latest, engines_updated: updated, events_added: events, held_rows: b.held_rows.length, differences };
}
