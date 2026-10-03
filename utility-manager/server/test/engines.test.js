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

function maafushiReport({ months = [PREVIOUS, EXPECTED], powerhouse = 'K. MAAFUSHI' } = {}) {
  const sheets = months.map((month, i) => reportSheet({
    name: sheetName(month, i + 1),
    powerhouse,
    updated: shift(month, 1),
    peak: '3686 KW 29/08/2026 14:37',
    gensets: [
      { number: 1, make: 'CATERPILLAR', model: '3516B', kw: 1600, serial: 'YBT00586', altMake: 'STAMFORD', altKw: 1600,
        status: 'RUNNING; OK', fault: 'No Fault', overhaul: { date: '2025-06-01' }, sinceOverhaul: { hours: 3457.3 + i * 500 },
        total: { hours: 37057 + i * 500 }, altService: '24/9/2024', valve: '31/05/2025', capable: '1300 KW', maxLoad: '1047 KW',
        needsOverhaul: 'NO', altNeedsService: 'NO', connected: 'YES' },
      { number: 2, make: 'CUMMINS', model: 'KTA 50-G3', kw: 1000, serial: '41374910', status: 'RUNNING; MINOR FAULT',
        fault: 'Oil Leaking (Front & Back Seal)', total: '10603:00', altService: i ? '15.06.2026' : '-',
        needsOverhaul: 'NO', altNeedsService: 'YES' },
      // A genset the register does not have yet (Maafushi has 8 in the seed; use 9).
      { number: 9, make: 'CUMMINS', model: 'QSK 60-G4', kw: 1600, serial: 'NEW-9', status: 'NOT RUNNING; MAJOR FAULT',
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
    assert.equal(all.summary.alt_service_due, 1);
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
    assert.deepEqual(engines.engines.map((e) => e.tag), ['2']);
    assert.equal(engines.engines[0].open_work[0].status, 'awaiting_parts');
    const dash = (await call('GET', '/dashboard', { token: admin })).body;
    assert.equal(dash.work[0].title, 'Replace front and rear crank seals');
    assert.equal(dash.work[0].last_update, 'Seals ordered from Malé');

    await call('POST', `/work/${created.body.id}/updates`, { token: manager, body: { body: 'Seals fitted, no leaks', status: 'completed' } });
    const asset = (await call('GET', `/assets/${g2.id}`, { token: admin })).body;
    const repair = asset.maintenance.find((e) => e.kind === 'repair');
    assert.equal(repair.source, 'work');
    assert.equal(repair.running_hours, 10603);
    assert.equal(asset.work[0].status, 'completed');
    assert.equal((await call('GET', '/work', { token: admin })).body.total, 0, 'no open work left');
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
    const data = maafushiReport({ powerhouse: 'K. DHIFFUSHI', months: ['2023-11-01', '2023-12-01'] });
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
});
