// Engine condition reports, maintenance history and work orders.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { classifyCondition, fixSinceHours, parseConditionReport, toDate, toHours } from '../src/conditionReport.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { expectedMonth, matchIsland } from '../src/reportImport.js';
import { inferStatus } from '../src/routes/work.js';
import { seedRegister } from '../scripts/seed.js';
import { makeXlsx, reportSheet } from './xlsxFixture.js';

const PASSWORD = 'correct horse 42';
let app, db, admin, manager, maafushi, dhigurah;

async function call(method, url, { token, body } = {}) {
  const res = await app.inject({
    method, url: `/api/v1${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body } : {}),
  });
  let json;
  try { json = res.json(); } catch { json = undefined; }
  return { status: res.statusCode, body: json, raw: res };
}

async function login(email) {
  const res = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

// Report months relative to today, so "up to date" holds whenever tests run.
const mvToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Indian/Maldives' });
const shift = (month, n) => { const d = new Date(`${month}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const EXPECTED = expectedMonth(mvToday());
const PREVIOUS = shift(EXPECTED, -1);
const MONTH_NAMES = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const sheetName = (month, i) => `${i}. ${MONTH_NAMES[+month.slice(5, 7) - 1]} ${month.slice(0, 4)}`;

// serial: a suffix so another island's report has its own engines.
function maafushiReport({ months = [PREVIOUS, EXPECTED], powerhouse = 'K. MAAFUSHI', serial = '' } = {}) {
  const sheets = months.map((month, i) => reportSheet({
    name: sheetName(month, i + 1),
    powerhouse,
    updated: shift(month, 1),
    peak: '3686 KW 29/08/2026 14:37',
    gensets: [
      { number: 1, make: 'CATERPILLAR', model: '3516B', kw: 1600, serial: `YBT00586${serial}`, altMake: 'STAMFORD', altKw: 1600,
        status: 'RUNNING; OK', fault: 'No Fault', overhaul: { date: '2025-06-01' }, sinceOverhaul: { hours: 3457.3 + i * 500 },
        total: { hours: 37057 + i * 500 }, altService: '24/9/2024', valve: '31/05/2025', capable: '1300 KW', maxLoad: '1047 KW',
        needsOverhaul: 'NO', altNeedsService: 'NO', connected: 'YES' },
      { number: 2, make: 'CUMMINS', model: 'KTA 50-G3', kw: 1000, serial: `41374910${serial}`, status: 'RUNNING; MINOR FAULT',
        fault: 'Oil Leaking (Front & Back Seal)', total: '10603:00', altService: i ? '15.06.2026' : '-',
        needsOverhaul: 'NO', altNeedsService: 'YES' },
      // A genset the register does not have yet (Maafushi has 8 in the seed; use 9).
      { number: 9, make: 'CUMMINS', model: 'QSK 60-G4', kw: 1600, serial: `NEW-9${serial}`, status: 'NOT RUNNING; MAJOR FAULT',
        fault: 'Crankshaft damage', overhaul: '09.05.2025', sinceOverhaul: '879:30', total: '63226:30',
        needsOverhaul: 'YES', altNeedsService: 'No' },
    ],
  }));
  return Buffer.from(makeXlsx(sheets)).toString('base64');
}

before(async () => {
  db = await createDb({ pgliteDir: ':memory:' });
  await migrate(db, {});
  await seedRegister(db);
  // Every seeded powerhouse is surveyed and expected to report (as on the live system).
  await db.query("update facilities set reports_from = '2024-01-01' where kind = 'powerhouse'");
  app = await buildApp({ db, config: loadConfig({ timezone: 'Indian/Maldives', webDist: '' }), logger: false });
  const hash = await hashPassword(PASSWORD);
  await db.query(`insert into users (email, full_name, role, password_hash, must_change_password) values
    ('admin@srd.mv', 'Admin', 'admin', $1, false), ('mgr@srd.mv', 'Maafushi Manager', 'manager', $1, false)`, [hash]);
  admin = await login('admin@srd.mv');
  const islands = (await call('GET', '/islands', { token: admin })).body;
  maafushi = islands.find((i) => i.name === 'Maafushi');
  dhigurah = islands.find((i) => i.name === 'Dhigurah');
  await db.query(`insert into user_scopes (user_id, island_id) select id, $1 from users where email = 'mgr@srd.mv'`, [maafushi.id]);
  manager = await login('mgr@srd.mv');
});

after(async () => {
  await app?.close();
  await db?.close();
});

describe('reading the report template', () => {
  test('dates and running hours in the formats the islands use', () => {
    assert.equal(toDate({ v: '21.02.2021' }), '2021-02-21');
    assert.equal(toDate({ v: '13/07/2019' }), '2019-07-13');
    assert.equal(toDate({ v: '27-06-2021' }), '2021-06-27');
    assert.equal(toDate({ v: '25 Feb. 2023' }), '2023-02-25');
    assert.equal(toDate({ v: 'Nill' }), null);
    assert.equal(toHours({ v: '13886:22' }), 13886.4);
    assert.equal(toHours({ v: '4189 Hours.' }), 4189);
    assert.equal(toHours({ v: '35721 HRM' }), 35721);
    assert.equal(toHours({ v: '62851;22' }), 62851.4);
    assert.equal(toHours({ v: 285.132, fmt: '[h]:mm' }), 6843.2);
    assert.equal(toHours({ v: '-' }), null);
  });

  test('hours "since" a service that are really the hours AT the service are corrected', () => {
    const g = { valve_on: '2025-06-08', hours_since_valve: 59691, total_hours: 63227 };
    fixSinceHours(g, 'valve_on', 'hours_since_valve', 'valve_hours', '2026-09-01');
    assert.equal(g.valve_hours, 59691);
    assert.equal(g.hours_since_valve, 3536);
    const ok = { overhaul_on: '2025-06-01', hours_since_overhaul: 6527, total_hours: 40630 };
    fixSinceHours(ok, 'overhaul_on', 'hours_since_overhaul', 'overhaul_hours', '2026-09-01');
    assert.equal(ok.hours_since_overhaul, 6527, 'a possible figure is left alone');
  });

  test('engine status text becomes a condition', () => {
    assert.equal(classifyCondition('RUNNING; OK'), 'ok');
    assert.equal(classifyCondition('RUNNING; MINOR FAULT'), 'minor_fault');
    assert.equal(classifyCondition('RUNNING; MAJOR FAULT'), 'major_fault');
    assert.equal(classifyCondition('NOT RUNNING; DISCONNECTED'), 'not_running');
    assert.equal(classifyCondition('RUNNING', 'Radiator leak'), 'minor_fault');
  });

  test('a workbook gives the latest month and every month before it', () => {
    const parsed = parseConditionReport(Buffer.from(maafushiReport(), 'base64'), 'K.MAAFUSHI ENGINE CONDITION REPORT 2026.xlsx');
    assert.equal(parsed.powerhouse, 'K. MAAFUSHI');
    assert.deepEqual(parsed.reports.map((r) => r.month), [PREVIOUS, EXPECTED]);
    const [g1, g2, g9] = parsed.latest.gensets;
    assert.equal(g1.total_hours, 37557);
    assert.equal(g1.overhaul_on, '2025-06-01');
    assert.equal(g1.alt_serviced_on, '2024-09-24');
    assert.equal(g1.capable_kw, 1300);
    assert.equal(g1.fault, undefined, '"No Fault" is not a fault');
    assert.equal(g2.condition, 'minor_fault');
    assert.equal(g2.alt_needs_service, true);
    assert.equal(g9.condition, 'not_running');
    assert.equal(g9.hours_since_overhaul, 879.5);
  });

  test('island names are matched despite spelling differences', () => {
    const islands = [
      { id: '1', name: 'Kunburudhoo', atoll_code: 'ADh' }, { id: '2', name: 'Villingili', atoll_code: 'K' },
      { id: '3', name: 'Bodufolhudhoo', atoll_code: 'AA' }, { id: '4', name: 'Dhiggaru', atoll_code: 'M' },
      { id: '5', name: 'Maafushi', atoll_code: 'K' },
    ];
    assert.equal(matchIsland(islands, 'ADH. KUMBURUDHOO').island.id, '1');
    assert.equal(matchIsland(islands, 'K. VILLINGILLI').island.id, '2');
    assert.equal(matchIsland(islands, 'BODUFOLHUDHOO').island.id, '3');
    assert.equal(matchIsland(islands, 'M. DHIHGARU').island.id, '4');
    assert.equal(matchIsland(islands, null, 'K.MAAFUSHI ENGINE CONDITION REPORT 2026.xlsx').island.id, '5');
    assert.equal(matchIsland(islands, 'XYZ').island, null);
  });
});

describe('uploading condition reports', () => {
  test('Alif Alif powerhouses are in the register', async () => {
    const atolls = (await call('GET', '/atolls', { token: admin })).body;
    assert.equal(atolls.find((a) => a.code === 'AA').island_count, 8);
  });

  test('preview finds the island and says what will change, saving nothing', async () => {
    const res = await call('POST', '/condition-reports/preview', { token: manager, body: { file_name: 'report.xlsx', data: maafushiReport() } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.island.id, maafushi.id);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.report_month, EXPECTED);
    assert.equal(res.body.gensets.length, 3);
    assert.equal(res.body.gensets.find((g) => g.number === '9').exists, false);
    assert.ok(res.body.new_events >= 4);
    assert.match(res.body.warnings.join(' '), /Genset 9 will be added/);
    const { rows } = await db.query('select count(*)::int as n from engine_conditions');
    assert.equal(rows[0].n, 0);
  });

  test('a manager cannot upload for an island that is not theirs', async () => {
    const data = maafushiReport({ powerhouse: 'ADH. DHIGURAH' });
    const preview = await call('POST', '/condition-reports/preview', { token: manager, body: { data } });
    assert.equal(preview.body.island.id, dhigurah.id);
    assert.equal(preview.body.ok, false);
    const res = await call('POST', '/condition-reports/import', { token: manager, body: { data, island_id: dhigurah.id } });
    assert.equal(res.status, 403);
  });

  test('importing keeps the latest condition and builds the maintenance history', async () => {
    const res = await call('POST', '/condition-reports/import', { token: manager, body: { file_name: 'report.xlsx', data: maafushiReport(), island_id: maafushi.id } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.gensets_added, 1);
    assert.equal(res.body.gensets_updated, 3);

    const island = (await call('GET', `/islands/${maafushi.id}`, { token: admin })).body;
    assert.equal(island.reports[0].report_month, EXPECTED);
    const gensets = island.facilities[0].assets;
    const g1 = gensets.find((a) => a.tag === '1');
    assert.equal(g1.serial_no, 'YBT00586', 'register filled from the report');
    assert.equal(g1.condition, 'ok');
    assert.equal(g1.last_overhaul_on, '2025-06-01');
    const g9 = gensets.find((a) => a.tag === '9');
    assert.equal(g9.status, 'down', 'a not-running engine is marked down');

    const asset = (await call('GET', `/assets/${gensets.find((a) => a.tag === '2').id}`, { token: admin })).body;
    assert.equal(asset.condition.fault, 'Oil Leaking (Front & Back Seal)');
    assert.equal(asset.engine.alt_service_due, true);
    assert.deepEqual(asset.maintenance.map((e) => [e.kind, e.done_on, e.source]), [['alternator_service', '2026-06-15', 'report']]);
    assert.equal(asset.hours_log.length, 2);

    const g1Detail = (await call('GET', `/assets/${g1.id}`, { token: admin })).body;
    const overhaul = g1Detail.maintenance.find((e) => e.kind === 'overhaul');
    assert.equal(overhaul.running_hours, 37557 - 3957, 'hours at overhaul = total - hours since');
  });

  test('uploading the same report again changes nothing; an older one keeps the newer condition', async () => {
    const again = await call('POST', '/condition-reports/import', { token: manager, body: { data: maafushiReport(), island_id: maafushi.id } });
    assert.equal(again.body.events_added, 0);
    const older = await call('POST', '/condition-reports/import', { token: manager, body: { data: maafushiReport({ months: [shift(PREVIOUS, -2)] }), island_id: maafushi.id } });
    assert.equal(older.body.gensets_updated, 0);
    const island = (await call('GET', `/islands/${maafushi.id}`, { token: admin })).body;
    assert.equal(island.reports[0].report_month, EXPECTED);
  });

  test('the tracker shows who is up to date and who is missing', async () => {
    const res = await call('GET', '/condition-reports', { token: admin });
    assert.equal(res.body.expected_month, EXPECTED);
    const m = res.body.powerhouses.find((p) => p.island_id === maafushi.id);
    assert.equal(m.state, 'up_to_date');
    assert.equal(m.uploaded_by_name, 'Maafushi Manager');
    assert.equal(res.body.powerhouses.find((p) => p.island_id === dhigurah.id).state, 'never');
    assert.equal(res.body.missing, res.body.powerhouses.length - 1);
    const dash = (await call('GET', '/dashboard', { token: admin })).body;
    assert.equal(dash.reports.missing.length, res.body.powerhouses.length - 1);
  });

  test('the engines view summarises the fleet and filters it', async () => {
    const all = (await call('GET', '/engines', { token: admin })).body;
    assert.equal(all.summary.total, 141);
    assert.equal(all.summary.ok, 1);
    assert.equal(all.summary.minor_fault, 1);
    assert.equal(all.summary.not_running, 1);
    assert.equal(all.summary.overhaul_due, 1);
    // One ticked on its sheet, one due by rule (last service over 12 months ago).
    assert.equal(all.summary.alt_service_due, 2);
    assert.equal(all.summary.alt_requested, 1);
    const faults = (await call('GET', '/engines?condition=faults', { token: admin })).body;
    assert.deepEqual(faults.engines.map((e) => e.tag).sort(), ['2', '9']);
    const due = (await call('GET', '/engines?flag=overhaul', { token: admin })).body;
    assert.deepEqual(due.engines.map((e) => e.tag), ['9']);
    const csv = await call('GET', '/engines?format=csv&island_id=' + maafushi.id, { token: admin });
    assert.match(csv.raw.body, /Hours since overhaul/);
  });
});

describe('work and maintenance history', () => {
  let g2;
  before(async () => {
    const island = (await call('GET', `/islands/${maafushi.id}`, { token: admin })).body;
    g2 = island.facilities[0].assets.find((a) => a.tag === '2');
  });

  test('ongoing work on a genset shows everywhere and its completion lands in the history', async () => {
    const created = await call('POST', '/work', { token: manager, body: {
      asset_id: g2.id, kind: 'repair', title: 'Replace front and rear crank seals', assigned_to: 'Mechanical team' } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.island_id, maafushi.id);
    assert.equal(created.body.status, 'in_progress');
    assert.match(created.body.ref, /^WO-\d{4}$/);

    const parts = await call('POST', `/work/${created.body.id}/updates`, { token: manager, body: { body: 'Seals ordered from Malé', status: 'awaiting_parts' } });
    assert.equal(parts.status, 201);
    const engines = (await call('GET', '/engines?flag=work', { token: admin })).body;
    // G9 too: the report says it is not running, which opened work for it.
    assert.deepEqual(engines.engines.map((e) => e.tag), ['2', '9']);
    assert.equal(engines.engines[0].open_work[0].status, 'awaiting_parts');
    assert.match(engines.engines[1].open_work[0].title, /^Genset 9 down/);
    const dash = (await call('GET', '/dashboard', { token: admin })).body;
    const seals = dash.work.find((w) => w.title === 'Replace front and rear crank seals');
    assert.equal(seals.last_update, 'Seals ordered from Malé');

    await call('POST', `/work/${created.body.id}/updates`, { token: manager, body: { body: 'Seals fitted, no leaks', status: 'completed' } });
    const asset = (await call('GET', `/assets/${g2.id}`, { token: admin })).body;
    const repair = asset.maintenance.find((e) => e.kind === 'repair');
    assert.equal(repair.source, 'work');
    assert.equal(repair.running_hours, 10603);
    assert.equal(asset.work[0].status, 'completed');
    assert.deepEqual((await call('GET', '/work', { token: admin })).body.items.map((w) => w.asset_tag), ['9'], 'only G9 still open');
  });

  test('work cannot be logged on another island', async () => {
    const res = await call('POST', '/work', { token: manager, body: { island_id: dhigurah.id, service: 'electricity', kind: 'other', title: 'x' } });
    assert.equal(res.status, 403);
  });

  test('island-wide work names its service; each section shows its own work', async () => {
    const noService = await call('POST', '/work', { token: manager, body: { island_id: maafushi.id, kind: 'repair', title: 'Water main leak' } });
    assert.equal(noService.status, 400);
    const water = await call('POST', '/work', { token: manager, body: { island_id: maafushi.id, service: 'water', kind: 'repair', title: 'Water main leak' } });
    assert.equal(water.status, 201, JSON.stringify(water.body));
    assert.equal(water.body.service, 'water');
    const waterList = (await call('GET', '/work?service=water', { token: admin })).body;
    assert.deepEqual(waterList.items.map((w) => w.title), ['Water main leak']);
    const section = (await call('GET', '/services/water', { token: admin })).body;
    assert.deepEqual(section.work.map((w) => w.title), ['Water main leak']);
    const dash = (await call('GET', '/dashboard', { token: admin })).body;
    assert.equal(dash.services.water.open_work, 1);
  });

  test('the electricity section summarises engines, faults and reports', async () => {
    const e = (await call('GET', '/services/electricity', { token: admin })).body;
    assert.equal(e.engines.not_running, 1);
    assert.ok(e.attention.some((a) => a.tag === '9' && a.condition === 'not_running'));
    assert.ok(e.facilities.find((f) => f.island_id === maafushi.id).report_state === 'up_to_date');
    assert.equal(e.reports.missing.length, e.facilities.filter((f) => f.kind === 'powerhouse').length - 1);
    assert.ok(e.capacity.find((c) => c.unit === 'kW').rated > 0);
    assert.equal((await call('GET', '/services/gas', { token: admin })).status, 400);
  });

  test('powerhouses whose latest report is before 2024 are not chased', async () => {
    const data = maafushiReport({ powerhouse: 'K. DHIFFUSHI', months: ['2023-11-01', '2023-12-01'], serial: 'DH' });
    const islands = (await call('GET', '/islands', { token: admin })).body;
    const dhiffushi = islands.find((i) => i.name === 'Dhiffushi');
    const res = await call('POST', '/condition-reports/import', { token: admin, body: { data, island_id: dhiffushi.id } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const t = (await call('GET', '/condition-reports', { token: admin })).body;
    assert.equal(t.powerhouses.find((p) => p.island_id === dhiffushi.id).state, 'untracked');
    const e = (await call('GET', '/services/electricity', { token: admin })).body;
    assert.ok(!e.reports.missing.some((m) => m.island_id === dhiffushi.id));
  });

  test('maintenance can be recorded by hand; report records are protected', async () => {
    const add = await call('POST', `/assets/${g2.id}/maintenance`, { token: manager, body: {
      kind: 'top_overhaul', done_on: '2026-01-15', running_hours: 9000, notes: 'Top overhaul by contractor' } });
    assert.equal(add.status, 201, JSON.stringify(add.body));
    assert.equal((await call('DELETE', `/maintenance/${add.body.id}`, { token: manager })).status, 200);
    const asset = (await call('GET', `/assets/${g2.id}`, { token: admin })).body;
    const fromReport = asset.maintenance.find((e) => e.source === 'report');
    assert.equal((await call('DELETE', `/maintenance/${fromReport.id}`, { token: manager })).status, 403);
  });

  test('a completed work order logged on the wrong engine can be moved, redated and reopened', async () => {
    const island = (await call('GET', `/islands/${maafushi.id}`, { token: admin })).body;
    const g3 = island.facilities[0].assets.find((a) => a.kind === 'genset' && a.tag === '3');
    const history = async (assetId) => (await call('GET', `/assets/${assetId}`, { token: admin })).body.maintenance
      .filter((e) => e.kind === 'alternator_service' && e.source === 'work');
    const w = (await call('POST', '/work', { token: manager, body: {
      asset_id: g2.id, kind: 'alternator_service', title: 'Gen 3 alternator periodic service', status: 'completed', completed_on: '2026-10-07' } })).body;
    assert.deepEqual((await history(g2.id)).map((e) => e.done_on), ['2026-10-07']);

    const moved = await call('PATCH', `/work/${w.id}`, { token: manager, body: { asset_id: g3.id } });
    assert.equal(moved.status, 200, JSON.stringify(moved.body));
    assert.equal(moved.body.asset_tag, '3');
    assert.deepEqual(await history(g2.id), [], 'taken back from the wrong engine');
    assert.deepEqual((await history(g3.id)).map((e) => [e.done_on, e.work_id]), [['2026-10-07', w.id]]);

    await call('PATCH', `/work/${w.id}`, { token: manager, body: { completed_on: '2026-10-06' } });
    assert.deepEqual((await history(g3.id)).map((e) => e.done_on), ['2026-10-06'], 'date follows the work order');

    const reopened = await call('POST', `/work/${w.id}/updates`, { token: manager, body: { body: 'Reopened: not finished', status: 'in_progress' } });
    assert.equal(reopened.status, 201);
    assert.deepEqual(await history(g3.id), [], 'reopening takes the entry back');
    const audit = (await call('GET', `/audit?entity=work_orders&entity_id=${w.id}`, { token: admin })).body.items;
    assert.ok(audit.some((l) => l.changes.asset_id), 'engine change is in the audit trail');
  });

  test('maintenance records can be corrected with a reason', async () => {
    const add = (await call('POST', `/assets/${g2.id}/maintenance`, { token: manager, body: { kind: 'battery_change', done_on: '2026-03-01' } })).body;
    assert.equal((await call('PATCH', `/maintenance/${add.id}`, { token: manager, body: { done_on: '2026-03-10' } })).status, 400, 'reason required');
    const fixed = await call('PATCH', `/maintenance/${add.id}`, { token: manager, body: { done_on: '2026-03-10', running_hours: 9500, reason: 'Date typed wrong' } });
    assert.equal(fixed.status, 200, JSON.stringify(fixed.body));
    assert.equal(fixed.body.done_on, '2026-03-10');
    assert.equal(fixed.body.edit_reason, 'Date typed wrong');
    const audit = (await call('GET', `/audit?entity=maintenance_events&entity_id=${add.id}`, { token: admin })).body.items;
    assert.equal(audit[0].changes.edit_reason.to, 'Date typed wrong');

    const asset = (await call('GET', `/assets/${g2.id}`, { token: admin })).body;
    const fromReport = asset.maintenance.find((e) => e.source === 'report');
    assert.equal((await call('PATCH', `/maintenance/${fromReport.id}`, { token: manager, body: { notes: 'x', reason: 'y' } })).status, 403);
    const fromWork = asset.maintenance.find((e) => e.source === 'work');
    const redate = await call('PATCH', `/maintenance/${fromWork.id}`, { token: manager, body: { done_on: '2026-01-01', reason: 'y' } });
    assert.equal(redate.status, 400);
    assert.match(redate.body.error?.message || JSON.stringify(redate.body), /work order/);
    assert.equal((await call('PATCH', `/maintenance/${fromWork.id}`, { token: manager, body: { running_hours: 10600, reason: 'Hours from log sheet' } })).status, 200);
  });

  test('schedule fields can be set, and drive the due flags', async () => {
    const res = await call('PATCH', `/assets/${g2.id}`, { token: manager, body: { next_overhaul_hours: 10000 } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const asset = (await call('GET', `/assets/${g2.id}`, { token: admin })).body;
    assert.equal(asset.engine.hours_to_overhaul, -603);
    assert.equal(asset.engine.overhaul_due, true);
  });

  test('a facility added by mistake can be deleted by an admin, but not one with history', async () => {
    const T = { token: admin };
    const f = (await call('POST', '/facilities', { ...T, body: { island_id: maafushi.id, service: 'water', kind: 'water_plant', name: 'Test RO Plant' } })).body;
    const a = (await call('POST', '/assets', { ...T, body: { facility_id: f.id, kind: 'ro_unit', tag: 'RO-9' } })).body;
    await call('POST', '/assets/status', { ...T, body: { items: [{ asset_id: a.id, status: 'maintenance', note: 'test' }] } });
    const g = (await call('POST', '/facilities', { ...T, body: { island_id: maafushi.id, service: 'water', kind: 'water_plant', name: 'Used RO Plant' } })).body;
    assert.equal((await call('POST', '/work', { ...T, body: { island_id: maafushi.id, facility_id: g.id, service: 'water', kind: 'repair', title: 'Real work' } })).status, 201);
    assert.equal((await call('DELETE', `/facilities/${g.id}`, T)).status, 409);
    assert.equal((await call('DELETE', `/facilities/${f.id}`, T)).status, 200);
    assert.equal((await call('GET', `/assets/${a.id}`, T)).status, 404);
  });

  test('a status update newer than the report decides the engine state (never "OK" and "Down" at once)', async () => {
    const tagId = async (tag) => (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.kind = 'genset' and s.tag = $2`, [maafushi.id, tag])).rows[0].id;
    const g1 = await tagId('1');
    const g9 = await tagId('9');
    const state = async (id) => (await call('GET', `/assets/${id}`, { token: admin })).body.condition;
    assert.equal((await state(g1)).condition, 'ok');
    const before = (await call('GET', '/dashboard', { token: admin })).body.engines;

    // G1: the report says OK; a manager then sets it down.
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g1, status: 'down', note: 'radiator leak' }] } });
    const s1 = await state(g1);
    assert.equal(s1.condition, 'not_running');
    assert.equal(s1.condition_source, 'status');
    assert.equal(s1.condition_note, 'radiator leak');
    assert.equal(s1.report_condition, 'ok');
    const list = (await call('GET', '/engines?condition=not_running', { token: admin })).body.engines;
    assert.ok(list.some((e) => e.id === g1 && e.status === 'down'));
    assert.ok(!(await call('GET', '/engines?condition=ok', { token: admin })).body.engines.some((e) => e.id === g1));
    const after = (await call('GET', '/dashboard', { token: admin })).body.engines;
    assert.equal(+after.not_running, +before.not_running + 1);
    assert.equal(+after.ok, +before.ok - 1);

    // Back to running: the report's OK applies again.
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g1, status: 'running' }] } });
    assert.deepEqual(((s) => [s.condition, s.condition_source])(await state(g1)), ['ok', 'report']);

    // G9: the report says NOT RUNNING; once set running it is back in service.
    assert.equal((await state(g9)).condition, 'not_running');
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g9, status: 'running', note: 'crankshaft replaced' }] } });
    const s9 = await state(g9);
    assert.equal(s9.condition, 'ok');
    assert.equal(s9.condition_source, 'status');
    assert.match(s9.condition_note, /Back in service: crankshaft replaced/);

    // No engine anywhere reads as running in one place and down in another.
    const all = (await call('GET', '/engines', { token: admin })).body.engines;
    const conflicts = all.filter((e) => (e.condition === 'not_running') !== ['down', 'maintenance'].includes(e.status) && e.status !== 'unknown');
    assert.deepEqual(conflicts.map((e) => `${e.island_name} ${e.tag}: ${e.condition}/${e.status}`), []);
  });

  test('a sheet whose "GENSET NO." label was typed over is still read, with a warning', async () => {
    const month = (n) => shift(EXPECTED, n);
    const sheets = [-1, 0].map((n, i) => {
      const sheet = reportSheet({
        name: sheetName(month(n), i + 1), powerhouse: 'ADH. DHIGURAH', updated: shift(month(n), 1),
        gensets: [{ number: 1, make: 'CUMMINS', model: 'KTA 38', kw: 800, status: 'RUNNING; OK', total: { hours: 1000 + n } },
          { number: 2, make: 'CUMMINS', model: 'KTA 38', kw: 800, status: 'RUNNING; OK', total: { hours: 2000 + n } }],
      });
      if (n === 0) sheet.rows[3][0] = 'pr';   // as in Thulusdhoo's April–August sheets
      return sheet;
    });
    const data = Buffer.from(makeXlsx(sheets)).toString('base64');
    const parsed = parseConditionReport(Buffer.from(data, 'base64'), 'ADH. DHIGURAH ENGINE CONDITION REPORT 2025.xlsx');
    assert.equal(parsed.latest.month, EXPECTED);
    assert.equal(parsed.latest.number_label_missing, true);
    assert.deepEqual(parsed.skipped, []);
    const preview = (await call('POST', '/condition-reports/preview', { token: admin, body: { file_name: 'dhigurah.xlsx', data } })).body;
    assert.equal(preview.report_month, EXPECTED);
    assert.ok(preview.warnings.some((w) => /"GENSET NO\." label is missing/.test(w)), preview.warnings.join(' | '));
  });

  test('sheets that cannot be read are named, and an old latest month is called out', async () => {
    const good = reportSheet({ name: sheetName(PREVIOUS, 1), powerhouse: 'ADH. DHIGURAH', updated: shift(PREVIOUS, 1),
      gensets: [{ number: 1, make: 'CUMMINS', model: 'KTA 38', kw: 800, status: 'RUNNING; OK' }, { number: 2, status: 'RUNNING; OK', make: 'X' }] });
    const broken = reportSheet({ name: sheetName(EXPECTED, 2), powerhouse: 'ADH. DHIGURAH', updated: shift(EXPECTED, 1),
      gensets: [{ number: 1, make: 'CUMMINS', status: 'RUNNING; OK' }] });
    broken.rows[3] = ['pr'];   // no numbers left at all
    const data = Buffer.from(makeXlsx([good, broken])).toString('base64');
    const preview = (await call('POST', '/condition-reports/preview', { token: admin, body: { file_name: 'dhigurah.xlsx', data } })).body;
    assert.equal(preview.report_month, PREVIOUS);
    assert.ok(preview.warnings.some((w) => w.includes(`Could not read sheet "${sheetName(EXPECTED, 2)}"`)), preview.warnings.join(' | '));
    assert.ok(preview.warnings.some((w) => /will still show as missing/.test(w)), preview.warnings.join(' | '));
  });

  test("a report's 'needs service / overhaul' clears once the work is recorded after the report", async () => {
    const tagId = async (tag) => (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.kind = 'genset' and s.tag = $2`, [maafushi.id, tag])).rows[0].id;
    const g2 = await tagId('2');   // the report says its alternator needs service
    const g9 = await tagId('9');   // the report says it needs an overhaul
    const engine = async (id) => (await call('GET', '/engines', { token: admin })).body.engines.find((e) => e.id === id);
    assert.equal((await engine(g2)).alt_service_due, true);
    assert.equal((await engine(g9)).overhaul_due, true);
    const dueBefore = (await call('GET', '/dashboard', { token: admin })).body.engines;

    // The report says G2's last alternator service was 15.06.2026. A service
    // recorded as older than that doesn't clear it...
    await call('POST', `/assets/${g2}/maintenance`, { token: manager, body: { kind: 'alternator_service', done_on: '2026-01-20' } });
    assert.equal((await engine(g2)).alt_service_due, true);

    // ...but a newer one does, even when backdated to before the report
    // (head office correcting a wrong report).
    await call('POST', `/assets/${g2}/maintenance`, { token: manager, body: { kind: 'alternator_service', done_on: '2026-06-20', notes: 'bearing replaced' } });
    const e2 = await engine(g2);
    assert.equal(e2.alt_service_due, false);
    assert.equal(e2.alt_needs_service, false);
    assert.equal((await call('GET', `/assets/${g2}`, { token: admin })).body.condition.report_alt_needs_service, true);

    // Done after the report through a completed work order: cleared too.
    const w = (await call('POST', '/work', { token: manager, body: { asset_id: g9, kind: 'overhaul', title: 'Major overhaul G9' } })).body;
    await call('PATCH', `/work/${w.id}`, { token: manager, body: { status: 'completed' } });
    assert.equal((await engine(g9)).overhaul_due, false);

    const dueAfter = (await call('GET', '/dashboard', { token: admin })).body.engines;
    assert.equal(+dueAfter.alt_service_due, +dueBefore.alt_service_due - 1);
    assert.equal(+dueAfter.overhaul_due, +dueBefore.overhaul_due - 1);
  });

  test('a genset move is tracked as work: stages, out of service on the way, transferred on completion', async () => {
    const isl = (await call('GET', '/islands', { token: admin })).body;
    const guraidhoo = isl.find((i) => i.name === 'Guraidhoo');
    const ph = (await db.query(`select id from facilities where island_id = $1 and kind = 'powerhouse'`, [guraidhoo.id])).rows[0].id;
    const g1 = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '1' and s.kind = 'genset'`, [maafushi.id])).rows[0].id;
    const before = (await call('GET', `/assets/${g1}`, { token: admin })).body;
    const repair = (await call('POST', '/work', { token: admin, body: { asset_id: g1, kind: 'repair', title: 'Fix before shipping' } })).body;
    const move = (body) => call('POST', '/work', { token: admin, body: { asset_id: g1, kind: 'relocation', title: 'Move G1 to Guraidhoo', dest_facility_id: ph, ...body } });

    // The number must be free at the destination; only move stages are allowed.
    const clash = await move({ dest_tag: '1' });
    assert.equal(clash.status, 409);
    assert.match(clash.body.error, /already has Genset 1/);
    assert.equal((await move({ dest_tag: '7', status: 'awaiting_parts' })).status, 400);
    // Managers can't move gensets to islands they can't change.
    assert.equal((await call('POST', '/work', { token: manager, body: { asset_id: g1, kind: 'relocation', title: 'x', dest_facility_id: ph, dest_tag: '7' } })).status, 403);

    const w = (await move({ dest_tag: '7', assigned_to: 'Logistics' })).body;
    assert.equal(w.status, 'planned');
    assert.equal(w.dest_island_name, 'Guraidhoo');
    assert.equal((await move({ dest_tag: '8' })).status, 409, 'one open move per genset');
    // Shown on both islands' work lists.
    assert.ok((await call('GET', `/work?island_id=${guraidhoo.id}`, { token: admin })).body.items.some((x) => x.id === w.id));

    // Under way: out of service at Maafushi, still registered there.
    await call('POST', `/work/${w.id}/updates`, { token: admin, body: { body: 'Dismantling started', status: 'dismantling' } });
    let a = (await call('GET', `/assets/${g1}`, { token: admin })).body;
    assert.equal(a.status, 'maintenance');
    assert.match(a.status_note, /Being moved to K\. Guraidhoo .*dismantling/);
    assert.equal(a.island_name, 'Maafushi');
    await call('POST', `/work/${w.id}/updates`, { token: admin, body: { body: 'Loaded on MV Example', status: 'in_transit' } });
    await call('PATCH', `/work/${w.id}`, { token: admin, body: { status: 'installing' } });
    assert.equal((await call('POST', `/work/${w.id}/updates`, { token: admin, body: { body: 'x', status: 'awaiting_parts' } })).status, 400);

    // Completed: transferred with its history; other open work follows; on standby there.
    await call('POST', `/work/${w.id}/updates`, { token: admin, body: { body: 'Commissioned', status: 'completed' } });
    a = (await call('GET', `/assets/${g1}`, { token: admin })).body;
    assert.equal(a.island_name, 'Guraidhoo');
    assert.equal(a.tag, '7');
    assert.equal(a.status, 'standby');
    assert.equal(a.maintenance.length, before.maintenance.length, 'history kept, and a move is not a maintenance event');
    assert.equal(a.hours_log.length, before.hours_log.length);
    assert.equal(a.moves[0].from_island, 'Maafushi');
    assert.equal(a.moves[0].work_id, w.id);
    assert.equal((await call('GET', `/work/${repair.id}`, { token: admin })).body.island_name, 'Guraidhoo');
    assert.ok(!(await call('GET', `/islands/${maafushi.id}`, { token: admin })).body.facilities.some((f) => f.assets.some((x) => x.id === g1)));
    // A finished move can't be reopened.
    assert.equal((await call('PATCH', `/work/${w.id}`, { token: admin, body: { status: 'in_transit' } })).status, 400);
    // Stages belong to moves only.
    assert.equal((await call('PATCH', `/work/${repair.id}`, { token: admin, body: { status: 'in_transit' } })).status, 400);
  });

  test('a report listing a genset registered at another island moves it instead of adding a duplicate', async () => {
    const isl = (await call('GET', '/islands', { token: admin })).body;
    const huraa = isl.find((i) => i.name === 'Huraa');
    // Maafushi's G2 (S/N 41374910) turns up in Huraa's report as Genset 9;
    // and Huraa's Genset 1 has been replaced by Maafushi's G9 (S/N NEW-9).
    const g2 = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '2' and s.kind = 'genset'`, [maafushi.id])).rows[0].id;
    const huraaG1 = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '1' and s.kind = 'genset'`, [huraa.id])).rows[0].id;
    await db.query(`update assets set serial_no = 'OLD-HURAA-1' where id = $1`, [huraaG1]);
    await db.query(`update assets s set serial_no = '6600-NEW9' from facilities f where f.id = s.facility_id and f.island_id = $1 and s.tag = '9'`, [maafushi.id]);
    const sheet = reportSheet({ name: sheetName(EXPECTED, 1), powerhouse: 'K. HURAA', updated: shift(EXPECTED, 1), gensets: [
      { number: 1, make: 'CUMMINS', model: 'QSK 60-G4', kw: 1600, serial: '6600 NEW9', status: 'RUNNING; OK', total: { hours: 63500 } },
      { number: 9, make: 'CUMMINS', model: 'KTA 50-G3', kw: 1000, serial: '41374910', status: 'RUNNING; OK', total: { hours: 11000 } },
    ] });
    const data = Buffer.from(makeXlsx([sheet])).toString('base64');
    const preview = (await call('POST', '/condition-reports/preview', { token: admin, body: { file_name: 'huraa.xlsx', data } })).body;
    assert.equal(preview.moves.length, 2, JSON.stringify(preview.warnings));
    assert.ok(preview.warnings.some((w) => /Genset 9 \(S\/N 41374910\) is registered at K\. Maafushi as Genset 2/.test(w)), preview.warnings.join(' | '));
    assert.ok(preview.warnings.some((w) => /previously registered here as Genset 1 .* marked as removed/.test(w)), preview.warnings.join(' | '));
    assert.ok(!preview.warnings.some((w) => /will be added to the register/.test(w)));

    const res = await call('POST', '/condition-reports/import', { token: admin, body: { file_name: 'huraa.xlsx', data, island_id: huraa.id } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.gensets_moved, 2);
    assert.equal(res.body.gensets_added, 0);
    const moved = (await call('GET', `/assets/${g2}`, { token: admin })).body;
    assert.equal(moved.island_name, 'Huraa');
    assert.equal(moved.tag, '9');
    assert.equal(moved.moves[0].source, 'report');
    const tracked = (await call('GET', `/work/${moved.moves[0].work_id}`, { token: admin })).body;
    assert.equal(tracked.kind, 'relocation');
    assert.equal(tracked.status, 'completed');
    assert.ok(moved.maintenance.length > 0, 'history kept');
    const old = (await db.query('select active, tag, status from assets where id = $1', [huraaG1])).rows[0];
    assert.equal(old.active, false);
    assert.match(old.tag, /^1 \(removed/);
    assert.equal(old.status, 'decommissioned');
  });

  test('a serial number corrected by hand is kept over the report, and not mistaken for a move', async () => {
    const isl = (await call('GET', '/islands', { token: admin })).body;
    const gaafaru = isl.find((i) => i.name === 'Gaafaru');
    const gulhi = isl.find((i) => i.name === 'Gulhi');
    const at = async (island, tag) => (await db.query(`select s.id, s.serial_no, s.facility_id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = $2 and s.kind = 'genset'`, [island.id, tag])).rows[0];
    const real = await at(gulhi, '2');
    await db.query(`update assets set serial_no = 'REAL-12345' where id = $1`, [real.id]);   // Gulhi G2 really has this serial
    const g1 = await at(gaafaru, '1');
    // Gaafaru's report wrongly gives its G1 Gulhi G2's serial; corrected by hand.
    const fix = await call('PATCH', `/assets/${g1.id}`, { token: admin, body: { serial_no: 'GAAF-99999' } });
    assert.equal(fix.status, 200);
    assert.equal(fix.body.serial_locked, true);
    const sheet = reportSheet({ name: sheetName(EXPECTED, 1), powerhouse: 'K. GAAFARU', updated: shift(EXPECTED, 1), gensets: [
      { number: 1, make: 'CUMMINS', serial: 'REAL 12345', status: 'RUNNING; OK', total: { hours: 5000 } },
      { number: 2, make: 'CUMMINS', status: 'RUNNING; OK', total: { hours: 4000 } },
    ] });
    const data = Buffer.from(makeXlsx([sheet])).toString('base64');
    const preview = (await call('POST', '/condition-reports/preview', { token: admin, body: { file_name: 'gaafaru.xlsx', data } })).body;
    assert.deepEqual(preview.moves, []);
    assert.ok(preview.warnings.some((w) => /corrected to GAAF-99999 in the register, which is kept/.test(w)), preview.warnings.join(' | '));
    const res = await call('POST', '/condition-reports/import', { token: admin, body: { file_name: 'gaafaru.xlsx', data, island_id: gaafaru.id } });
    assert.equal(res.status, 200);
    assert.equal(res.body.gensets_moved, 0);
    assert.equal((await at(gaafaru, '1')).serial_no, 'GAAF-99999');
    assert.equal((await at(gulhi, '2')).facility_id, real.facility_id);
  });

  test('setting a genset down opens work automatically, or updates its open work', async () => {
    const tagId = async (tag) => (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = $2 and s.kind = 'genset' and s.active`, [maafushi.id, tag])).rows[0]?.id;
    const g = await tagId('6');
    const openWork = async () => (await call('GET', `/work?asset_id=${g}`, { token: admin })).body.items;
    assert.equal((await openWork()).length, 0);

    const res = await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g, status: 'down', note: 'Fuel injector pump failure' }] } });
    assert.equal(res.status, 200);
    let work = await openWork();
    assert.equal(work.length, 1);
    assert.equal(work[0].title, 'Genset 6 down: Fuel injector pump failure');
    assert.equal(work[0].kind, 'repair');
    assert.equal(work[0].status, 'planned');
    assert.equal(res.body.work[0].id, work[0].id);
    const audit = (await db.query(`select u.email from audit_log l join users u on u.id = l.user_id where l.entity = 'work_orders' and l.entity_id = $1`, [String(work[0].id)])).rows;
    assert.equal(audit[0].email, 'mgr@srd.mv', 'opened in the name of whoever set it down');

    // Still down: no second work order. Back up, then down again: the open work gets an update.
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g, status: 'down', note: 'still waiting' }] } });
    assert.equal((await openWork()).length, 1);
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g, status: 'running' }] } });
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g, status: 'down', note: 'Tripped again' }] } });
    work = await openWork();
    assert.equal(work.length, 1);
    assert.equal(work[0].last_update, 'Reported down: Tripped again');

    // Once that work is completed, the next breakdown opens new work.
    await call('PATCH', `/work/${work[0].id}`, { token: manager, body: { status: 'completed' } });
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g, status: 'running' }] } });
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g, status: 'down' }] } });
    work = await openWork();
    assert.equal(work.length, 1);
    assert.equal(work[0].title, 'Genset 6 down');
  });

  test('work status follows updates posted without a status', async () => {
    assert.equal(inferStatus('planned', 'ongoing troubleshooting'), 'in_progress');
    assert.equal(inferStatus('in_progress', 'AVR replaced no change'), null);
    assert.equal(inferStatus('in_progress', 'Waiting for parts from Male'), 'awaiting_parts');
    assert.equal(inferStatus('planned', 'spares ordered, ETA 2 weeks'), 'awaiting_parts');
    assert.equal(inferStatus('awaiting_parts', 'parts arrived today, fitting tomorrow'), 'in_progress');
    assert.equal(inferStatus('awaiting_parts', 'parts not yet arrived'), null);
    assert.equal(inferStatus('in_progress', 'Work on hold until the vessel arrives'), 'on_hold');
    assert.equal(inferStatus('in_progress', 'All done, back in service'), null, 'never completes by itself');
    assert.equal(inferStatus('planned', 'Dismantling started', 'relocation'), null, 'moves have their own stages');

    const w = (await call('POST', '/work', { token: manager, body: { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Check AVR', status: 'planned' } })).body;
    const post = async (text, status) => (await call('POST', `/work/${w.id}/updates`, { token: manager, body: { body: text, status } })).body;
    const statusNow = async () => (await call('GET', `/work/${w.id}`, { token: admin })).body.status;
    assert.equal((await call('GET', `/work/${w.id}`, { token: admin })).body.started_on, null);
    assert.equal((await post('status ongoing')).auto_status, 'in_progress');
    assert.equal(await statusNow(), 'in_progress');
    assert.ok((await call('GET', `/work/${w.id}`, { token: admin })).body.started_on, 'start date stamped');
    await post('Waiting for spares from Malé');
    assert.equal(await statusNow(), 'awaiting_parts');
    await post('Spares received');
    assert.equal(await statusNow(), 'in_progress');
    // A status chosen by hand wins.
    await post('Waiting for parts but parking it', 'on_hold');
    assert.equal(await statusNow(), 'on_hold');
  });

  test('alternator frame code and CPL can be edited through the API', async () => {
    const g = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.kind = 'genset' and s.active limit 1`, [maafushi.id])).rows[0].id;
    const res = await call('PATCH', `/assets/${g}`, { token: manager, body: { alt_frame: 'PI734B1', cpl_spec: '40869922' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.alt_frame, 'PI734B1');
    assert.equal(res.body.cpl_spec, '40869922');
    assert.equal((await call('PATCH', `/assets/${g}`, { token: manager, body: { cpl_spec: null } })).body.cpl_spec, null);
  });
});

describe('reports sent by Fleet Manager, and report history', () => {
  let gensets;
  before(async () => {
    // A fresh powerhouse: Dhigurah's two-month workbook.
    const data = maafushiReport({ powerhouse: 'ADH. DHIGURAH', serial: 'DG' });
    const res = await call('POST', '/condition-reports/import', { token: admin, body: { data, island_id: dhigurah.id } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    gensets = (await db.query(`select s.id, s.tag from assets s join facilities f on f.id = s.facility_id
                                where f.island_id = $1 and s.kind = 'genset' and s.active and s.serial_no like '%DG'
                                order by length(s.tag), s.tag`, [dhigurah.id])).rows;
  });
  const send = (body) => call('POST', '/condition-reports', { token: admin, body });

  test('uploads are kept month by month', async () => {
    const h = (await call('GET', `/condition-reports/history?asset_id=${gensets[0].id}`, { token: admin })).body;
    assert.ok(h.engines.length >= 2, 'every month in the workbook, not only the latest');
    assert.ok(h.engines.every((r) => r.source === 'upload'));
    assert.deepEqual(h.powerhouse.map((r) => r.report_month).slice(0, 2), [EXPECTED, PREVIOUS]);
  });

  test('a checked report becomes the latest, keeps its history and says where it differs from the upload', async () => {
    const [g1, g2] = gensets;
    const res = await send({
      report_month: EXPECTED, reported_on: mvToday(), file_name: 'K. Maafushi ECR.xlsx', source_ref: 'ECR import #412',
      peak_load: { kw: 1258, at: '2026-07-12T18:00:00+05:00' },
      held_rows: [{ genset: '7', reason: 'Hours went backwards (10,120 after 10,480)' }],
      engines: [
        { srd_asset_id: g1.id, status_text: 'RUNNING; OK', condition: 'ok', total_hours: 99999, last_alt_service_on: '2026-09-16', alt_needs_service: false },
        { srd_asset_id: g2.id, status_text: 'RUNNING; MINOR FAULT', condition: 'minor_fault', fault: 'Coolant leak', last_valve_on: '2024-07-23' },
      ],
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.latest, true);
    assert.equal(res.body.engines_updated, 2);
    assert.equal(res.body.held_rows, 1);
    assert.ok(res.body.events_added >= 1);
    const d1 = res.body.differences.find((x) => x.srd_asset_id === g1.id);
    assert.equal(Number(d1.fields.total_hours.fleet_manager), 99999);

    const engine = (await call('GET', `/assets/${g1.id}`, { token: admin })).body;
    assert.equal(engine.condition.total_hours, 99999);
    const alt = engine.maintenance.find((e) => e.kind === 'alternator_service' && e.done_on === '2026-09-16');
    assert.equal(alt.origin, 'fleet_manager');
    const h = (await call('GET', `/condition-reports/history?asset_id=${g1.id}`, { token: admin })).body;
    assert.deepEqual(h.engines.filter((r) => r.report_month === EXPECTED).map((r) => r.source).sort(), ['fleet_manager', 'upload'], 'both kept');
    const tracker = (await call('GET', '/condition-reports', { token: admin })).body;
    const ph = tracker.powerhouses.find((p) => p.island_id === dhigurah.id);
    assert.equal(ph.source, 'fleet_manager');
    assert.equal(ph.held_rows[0].genset, '7');
    const island = (await call('GET', `/islands/${dhigurah.id}`, { token: admin })).body;
    assert.equal(Number(island.reports.find((r) => r.source === 'fleet_manager').peak_load_kw), 1258);

    // Sent again: replaces what it sent, no duplicate.
    const again = await send({ report_month: EXPECTED, engines: [{ srd_asset_id: g1.id, condition: 'ok', total_hours: 99998 }] });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    const h2 = (await call('GET', `/condition-reports/history?asset_id=${g1.id}`, { token: admin })).body;
    assert.equal(h2.engines.filter((r) => r.report_month === EXPECTED && r.source === 'fleet_manager').length, 1);
  });

  test('an older month is kept in the history without replacing the latest', async () => {
    const res = await send({ report_month: shift(EXPECTED, -3), engines: [{ srd_asset_id: gensets[0].id, condition: 'major_fault', total_hours: 5000 }] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.latest, false);
    assert.equal(res.body.engines_updated, 0);
    assert.equal((await call('GET', `/assets/${gensets[0].id}`, { token: admin })).body.condition.total_hours, 99998);
  });

  test('powerhouses not surveyed yet are not chased until their reports start', async () => {
    const tracker = async () => (await call('GET', '/condition-reports', { token: admin })).body;
    const before = await tracker();
    const target = before.powerhouses.find((p) => p.state === 'never');
    // Not surveyed: out of the missing count and the dashboard.
    const off = await call('PATCH', `/facilities/${target.facility_id}`, { token: admin, body: { reports_from: null } });
    assert.equal(off.status, 200, JSON.stringify(off.body));
    let t = await tracker();
    assert.equal(t.powerhouses.find((p) => p.facility_id === target.facility_id).state, 'not_expected');
    assert.equal(t.missing, before.missing - 1);
    assert.equal(t.not_expected, before.not_expected + 1);
    const dash = (await call('GET', '/dashboard', { token: admin })).body;
    assert.ok(!dash.reports.missing.some((r) => r.facility_id === target.facility_id));
    // Reports starting later: chased from that month.
    await call('PATCH', `/facilities/${target.facility_id}`, { token: admin, body: { reports_from: shift(EXPECTED, 2) } });
    assert.equal((await tracker()).powerhouses.find((p) => p.facility_id === target.facility_id).state, 'not_expected');
    assert.equal((await call('PATCH', `/facilities/${target.facility_id}`, { token: admin, body: { reports_from: '2026-08-15' } })).status, 400);
    // A first report starts the chase by itself.
    const fresh = (await db.query(`insert into facilities (island_id, service, kind, name)
      select island_id, 'electricity', 'powerhouse', 'Second powerhouse' from facilities where id = $1 returning id`, [target.facility_id])).rows[0].id;
    const g = (await db.query(`insert into assets (facility_id, kind, tag) values ($1, 'genset', '1') returning id`, [fresh])).rows[0].id;
    assert.equal((await tracker()).powerhouses.find((p) => p.facility_id === fresh).state, 'not_expected');
    assert.equal((await send({ report_month: EXPECTED, engines: [{ srd_asset_id: g, condition: 'ok' }] })).status, 200);
    const after = (await db.query('select reports_from from facilities where id = $1', [fresh])).rows[0];
    assert.equal(after.reports_from, EXPECTED);
  });

  test('engines with no report count apart from engines down, and retired ones not at all', async () => {
    const before = (await call('GET', '/dashboard', { token: admin })).body.services.electricity;
    const g = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id
                                where s.kind = 'genset' and s.active and s.status = 'unknown' limit 1`)).rows[0];
    await call('POST', '/assets/status', { token: admin, body: { items: [{ asset_id: g.id, status: 'decommissioned', note: 'retired' }] } });
    const after = (await call('GET', '/dashboard', { token: admin })).body.services.electricity;
    assert.equal(after.assets, before.assets - 1);
    assert.equal(after.unknown, before.unknown - 1);
    assert.equal(after.down, before.down, 'no report is not down');
  });

  test('overhauls and alternator services fall due by interval, per model and per engine', async () => {
    const [g1] = gensets;
    const engine = async () => (await call('GET', `/assets/${g1.id}`, { token: admin })).body.engine;
    await db.query("update engine_conditions set needs_overhaul = false, alt_needs_service = false, hours_since_overhaul = 15000, last_alt_service_on = $2 where asset_id = $1",
      [g1.id, shift(EXPECTED, -6)]);
    await db.query("delete from maintenance_events where asset_id = $1 and kind in ('alternator_service', 'overhaul', 'top_overhaul')", [g1.id]);
    let e = await engine();
    assert.equal(e.hours_to_overhaul, 5000, 'region default: 20,000 h');
    assert.equal(e.overhaul_rule, 'interval');
    assert.equal(e.next_alt_service_due, shift(EXPECTED, 6), 'region default: 12 months');
    assert.equal(e.alt_service_due, false);

    const model = (await db.query('select make_model from assets where id = $1', [g1.id])).rows[0].make_model;
    const put = await call('PUT', '/service-intervals', { token: manager, body: {
      region: { overhaul_hours: 20000, alt_service_months: 12 }, models: [{ model_match: model.split(' ').at(-1), overhaul_hours: 12000, alt_service_months: 3 }] } });
    assert.equal(put.status, 200, JSON.stringify(put.body));
    e = await engine();
    assert.equal(e.hours_to_overhaul, -3000, 'model interval wins');
    assert.equal(e.overhaul_due, true);
    assert.equal(e.alt_service_due, true, 'due by rule without the tick');
    assert.equal(e.alt_requested, false);

    // Set on the genset itself (e.g. by Fleet Manager): wins over the rule.
    const set = await call('PATCH', `/assets/${g1.id}`, { token: admin, body: { next_alt_service_on: shift(EXPECTED, 9), next_overhaul_hours: 999999 } });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    e = await engine();
    assert.equal(e.alt_service_rule, 'set');
    assert.equal(e.alt_service_due, false);
    assert.equal(e.overhaul_due, false);
    const dash = (await call('GET', '/dashboard', { token: admin })).body.engines;
    assert.ok(dash.alt_service_due >= dash.alt_requested);
    assert.equal((await call('PUT', '/service-intervals', { token: manager, body: { region: {}, models: [{ model_match: 'KTA', overhaul_hours: 1 }, { model_match: 'kta' }] } })).status, 400);
    await call('PUT', '/service-intervals', { token: manager, body: { region: { overhaul_hours: 20000, alt_service_months: 12 }, models: [] } });
    assert.deepEqual((await call('GET', '/service-intervals', { token: admin })).body.models, []);
  });

  test('a genset registered twice is merged into one record with both histories', async () => {
    // Dhigurah G9 was "moved" by decommissioning it and registering it again at Maafushi.
    const old = gensets.find((g) => g.tag === '9');
    await call('POST', '/assets/status', { token: admin, body: { items: [{ asset_id: old.id, status: 'decommissioned', note: 'Moved to K. Maafushi' }] } });
    const ph = (await db.query("select id from facilities where island_id = $1 and kind = 'powerhouse' order by created_at limit 1", [maafushi.id])).rows[0].id;
    const fresh = (await db.query("insert into assets (facility_id, kind, tag, capacity_unit) values ($1, 'genset', '19', 'kW') returning id", [ph])).rows[0].id;
    await db.query('insert into hours_log (asset_id, month, total_hours) values ($1, $2, 1)', [fresh, EXPECTED]);
    const oldMonths = (await db.query('select month from hours_log where asset_id = $1', [old.id])).rows.length;
    assert.ok(oldMonths >= 2);

    // The retired one is out of the engine list and counts, listed under Retired.
    const list = (await call('GET', '/engines', { token: admin })).body;
    assert.ok(!list.engines.some((e) => e.id === old.id));
    assert.ok(list.summary.retired >= 1);
    const retired = (await call('GET', '/engines?condition=retired', { token: admin })).body;
    assert.ok(retired.engines.some((e) => e.id === old.id && !e.alt_service_due && !e.overhaul_due));

    const res = await call('POST', `/assets/${fresh}/merge`, { token: admin, body: { from_asset_id: old.id, moved_on: shift(EXPECTED, -1), notes: 'Serial typo' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.move.source, 'merge');
    assert.equal((await call('GET', `/assets/${old.id}`, { token: admin })).status, 404, 'duplicate removed');
    const merged = (await call('GET', `/assets/${fresh}`, { token: admin })).body;
    assert.equal(merged.make_model, 'CUMMINS QSK 60-G4', 'blanks filled from the old record');
    assert.equal(merged.moves[0].from_tag, '9');
    const hours = (await db.query('select month, total_hours from hours_log where asset_id = $1', [fresh])).rows;
    assert.equal(hours.length, oldMonths, 'old months moved, the clashing month kept from the current record');
    assert.equal(Number(hours.find((h) => h.month === EXPECTED).total_hours), 1);
    const island = (await call('GET', `/islands/${dhigurah.id}`, { token: admin })).body;
    const away = island.facilities.flatMap((f) => f.moved_away);
    assert.ok(away.some((m) => m.asset_id === fresh && m.from_tag === '9' && m.to_island === 'Maafushi'));

    assert.equal((await call('POST', `/assets/${fresh}/merge`, { token: admin, body: { from_asset_id: fresh, moved_on: EXPECTED } })).status, 400);
  });

  test('bad reports are refused', async () => {
    const other = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id
                                    where f.island_id = $1 and s.kind = 'genset' and s.active limit 1`, [maafushi.id])).rows[0];
    assert.equal((await send({ report_month: '2026-08-15', engines: [{ srd_asset_id: gensets[0].id }] })).status, 400);
    assert.equal((await send({ report_month: EXPECTED, engines: [{ srd_asset_id: '00000000-0000-4000-8000-000000000000' }] })).status, 400);
    if (other) assert.equal((await send({ report_month: EXPECTED, engines: [{ srd_asset_id: gensets[0].id }, { srd_asset_id: other.id }] })).status, 400);
    assert.equal((await send({ report_month: EXPECTED, engines: [] })).status, 400);
    const notTheirs = await call('POST', '/condition-reports', { token: manager, body: { report_month: EXPECTED, engines: [{ srd_asset_id: gensets[0].id }] } });
    assert.equal(notTheirs.status, 403, 'a manager for Maafushi cannot send Dhigurah\'s report');
  });
});
