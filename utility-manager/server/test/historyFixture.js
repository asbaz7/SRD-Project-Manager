// Report history as the system kept it before monthly updates replaced the
// workbooks (and Fleet Manager's reports): for tests of the engine views,
// due dates and history, which still read records received that way.
import { keepEngineReport, keepPowerhouseReport, setLatest, setLatestPowerhouse } from '../src/gensetRecords.js';

const shift = (month, n) => { const d = new Date(`${month}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

// The Maafushi workbook the tests used: G1 OK, G2 minor fault (alternator
// due), G9 (not on the register yet) not running and due an overhaul.
// i: the month's place in the workbook (hours grow 500 a month on G1).
export function maafushiGensets(i, serial = '') {
  return [
    { tag: '1', make_model: 'CATERPILLAR 3516B', kw: 1600, serial: `YBT00586${serial}`, r: {
      status_text: 'RUNNING; OK', condition: 'ok', total_hours: 37057 + i * 500, hours_since_overhaul: 3457.3 + i * 500,
      last_overhaul_on: '2025-06-01', last_alt_service_on: '2024-09-24', last_valve_on: '2025-05-31',
      capable_kw: 1300, max_load_kw: 1047, needs_overhaul: false, alt_needs_service: false } },
    { tag: '2', make_model: 'CUMMINS KTA 50-G3', kw: 1000, serial: `41374910${serial}`, r: {
      status_text: 'RUNNING; MINOR FAULT', condition: 'minor_fault', fault: 'Oil Leaking (Front & Back Seal)', total_hours: 10603,
      last_alt_service_on: i ? '2026-06-15' : null, needs_overhaul: false, alt_needs_service: true } },
    { tag: '9', make_model: 'CUMMINS QSK 60-G4', kw: 1600, serial: `NEW-9${serial}`, r: {
      status_text: 'NOT RUNNING; MAJOR FAULT', condition: 'not_running', fault: 'Crankshaft damage', total_hours: 63226.5,
      hours_since_overhaul: 879.5, last_overhaul_on: '2025-05-09', needs_overhaul: true, alt_needs_service: false } },
  ];
}

const EVENTS = [['last_overhaul_on', 'overhaul', 'hours_since_overhaul'], ['last_alt_service_on', 'alternator_service'],
  ['last_valve_on', 'valve_clearance', 'hours_since_valve'], ['last_battery_on', 'battery_change']];

/**
 * Records a workbook's months for an island's powerhouse as an upload did:
 * history per month, the latest per genset and powerhouse, hours, dated
 * services, gensets missing from the register added, status from the
 * condition. source: 'upload' or 'fleet_manager'.
 */
export async function seedHistory(db, { islandId, months, gensets = maafushiGensets, serial = '', userId = null, source = 'upload' }) {
  return db.tx(userId, async (t) => {
    const { rows: [ph] } = await t.query("select id from facilities where island_id = $1 and kind = 'powerhouse' and active order by created_at limit 1", [islandId]);
    for (const [i, month] of months.entries()) {
      const reportedOn = shift(month, 1);
      const list = gensets(i, serial);
      for (const g of list) {
        let { rows: [a] } = await t.query("select id, tag, status, status_at from assets where facility_id = $1 and kind = 'genset' and tag = $2 and active", [ph.id, g.tag]);
        if (!a) {
          a = (await t.query(`insert into assets (facility_id, kind, tag, make_model, rated_capacity, capacity_unit, serial_no)
                              values ($1, 'genset', $2, $3, $4, 'kW', $5) returning id, tag, status, status_at`, [ph.id, g.tag, g.make_model, g.kw, g.serial])).rows[0];
        } else {
          await t.query('update assets set serial_no = coalesce(serial_no, $2), make_model = coalesce(make_model, $3) where id = $1', [a.id, g.serial, g.make_model]);
        }
        await keepEngineReport(t, a.id, month, reportedOn, g.r, { source, userId });
        await setLatest(t, a, month, reportedOn, g.r, { source, userId });
        if (g.r.total_hours != null) {
          await t.query(`insert into hours_log (asset_id, month, total_hours) values ($1, $2, $3)
                         on conflict (asset_id, month) do update set total_hours = excluded.total_hours`, [a.id, month, g.r.total_hours]);
        }
        for (const [field, kind, since] of EVENTS) {
          const day = g.r[field];
          if (!day) continue;
          const hours = since && g.r.total_hours != null && g.r[since] != null ? Math.round(g.r.total_hours - g.r[since]) : null;
          await t.query(`insert into maintenance_events (asset_id, kind, done_on, running_hours, source, origin, created_by)
                         values ($1, $2, $3, $4, 'report', $5, $6) on conflict (asset_id, kind, done_on) do nothing`,
          [a.id, kind, day, hours, source, userId]);
        }
      }
      const p = { source, reported_on: reportedOn, genset_count: list.length, file_name: 'report.xlsx', userId };
      await keepPowerhouseReport(t, ph.id, month, p);
      await setLatestPowerhouse(t, ph.id, month, p);
    }
    return ph.id;
  });
}
