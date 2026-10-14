// Gensets: monthly updates, the history received before them, maintenance
// history and work orders.
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { expectedMonth, keepEngineReport, keepPowerhouseReport, setLatest, setLatestPowerhouse } from '../src/gensetRecords.js';
import { matchIsland } from '../src/islandNames.js';
import { migrate } from '../src/migrate.js';
import { inferStatus } from '../src/routes/work.js';
import { seedRegister } from '../scripts/seed.js';
import { seedHistory } from './historyFixture.js';

const PASSWORD = 'correct horse 42';
let app, db, admin, manager, managerId, maafushi, dhigurah;

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
  managerId = (await db.query("select id from users where email = 'mgr@srd.mv'")).rows[0].id;
});

after(async () => {
  await app?.close();
  await db?.close();
});

describe('island names', () => {
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
    // Any atoll code the islands carry, or the atoll's name.
    const om = [{ id: 'a', name: 'Omadhoo', atoll_code: 'ADh' }, { id: 't', name: 'Omadhoo', atoll_code: 'Th' }, ...islands];
    assert.equal(matchIsland(om, 'Th. Omadhoo').island.id, 't');
    assert.equal(matchIsland(om, 'THAA OMADHOO').island.id, 't');
    assert.equal(matchIsland(om, 'ADH.OMADHOO').island.id, 'a');
    assert.deepEqual(matchIsland(om, 'Omadhoo').candidates.map((c) => c.id), ['a', 't']);
  });
});

describe('history received before monthly updates', () => {
  before(async () => {
    // Maafushi's two-month workbook, uploaded by its manager.
    await seedHistory(db, { islandId: maafushi.id, months: [PREVIOUS, EXPECTED], userId: managerId });
  });

  test('Alif Alif powerhouses are in the register', async () => {
    const atolls = (await call('GET', '/atolls', { token: admin })).body;
    assert.equal(atolls.find((a) => a.code === 'AA').island_count, 8);
  });

  test('the latest month gives each genset its condition, with its maintenance history and hours', async () => {
    const island = (await call('GET', `/islands/${maafushi.id}`, { token: admin })).body;
    assert.equal(island.reports[0].report_month, EXPECTED);
    const gensets = island.facilities[0].assets;
    const g1 = gensets.find((a) => a.tag === '1');
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
    assert.equal(g1Detail.maintenance.find((e) => e.kind === 'overhaul').running_hours, 37557 - 3957, 'hours at overhaul = total - hours since');
  });

  test('workbooks can no longer be uploaded', async () => {
    for (const path of ['/condition-reports/preview', '/condition-reports/import']) {
      assert.equal((await call('POST', path, { token: admin, body: { data: 'eA==' } })).status, 404, path);
    }
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
    const islands = (await call('GET', '/islands', { token: admin })).body;
    const dhiffushi = islands.find((i) => i.name === 'Dhiffushi');
    await seedHistory(db, { islandId: dhiffushi.id, months: ['2023-11-01', '2023-12-01'], serial: 'DH' });
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

  test('status and faults are one current state (never "OK" and "Down" at once)', async () => {
    const tagId = async (tag) => (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.kind = 'genset' and s.tag = $2`, [maafushi.id, tag])).rows[0].id;
    const g1 = await tagId('1');
    const g9 = await tagId('9');
    const state = async (id) => (await call('GET', `/assets/${id}`, { token: admin })).body;
    assert.equal((await state(g1)).condition.condition, 'ok');
    const before = (await call('GET', '/dashboard', { token: admin })).body.engines;

    // G1 is set down: not running, wherever it shows.
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g1, status: 'down', note: 'radiator leak' }] } });
    let s1 = await state(g1);
    assert.equal(s1.condition.condition, 'not_running');
    assert.equal(s1.status_note, 'radiator leak');
    assert.equal(s1.condition.report_condition, 'ok', 'the monthly record is kept as it was');
    const list = (await call('GET', '/engines?condition=not_running', { token: admin })).body.engines;
    assert.ok(list.some((e) => e.id === g1 && e.status === 'down'));
    assert.ok(!(await call('GET', '/engines?condition=ok', { token: admin })).body.engines.some((e) => e.id === g1));
    const after = (await call('GET', '/dashboard', { token: admin })).body.engines;
    assert.equal(+after.not_running, +before.not_running + 1);
    assert.equal(+after.ok, +before.ok - 1);

    // Back to running: OK again.
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g1, status: 'running' }] } });
    assert.equal((await state(g1)).condition.condition, 'ok');

    // G9: down with a major fault; back in service clears the fault.
    s1 = await state(g9);
    assert.deepEqual([s1.status, s1.fault_level, s1.fault_note], ['down', 'major', 'Crankshaft damage']);
    await call('POST', '/assets/status', { token: manager, body: { items: [{ asset_id: g9, status: 'running', note: 'crankshaft replaced' }] } });
    const s9 = await state(g9);
    assert.deepEqual([s9.condition.condition, s9.fault_level, s9.fault_note], ['ok', 'none', null]);

    // No engine anywhere reads as running in one place and down in another.
    const all = (await call('GET', '/engines', { token: admin })).body.engines;
    const conflicts = all.filter((e) => (e.condition === 'not_running') !== ['down', 'maintenance'].includes(e.status) && e.condition);
    assert.deepEqual(conflicts.map((e) => `${e.island_name} ${e.tag}: ${e.condition}/${e.status}`), []);
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

describe('reports Fleet Manager sent, and report history', () => {
  let gensets;
  before(async () => {
    // A fresh powerhouse: Dhigurah's two-month workbook.
    await seedHistory(db, { islandId: dhigurah.id, months: [PREVIOUS, EXPECTED], serial: 'DG' });
    gensets = (await db.query(`select s.id, s.tag from assets s join facilities f on f.id = s.facility_id
                                where f.island_id = $1 and s.kind = 'genset' and s.active and s.serial_no like '%DG'
                                order by length(s.tag), s.tag`, [dhigurah.id])).rows;
  });
  // Fleet Manager no longer sends reports (disconnected 14 Oct 2026); the
  // ones it sent are kept as history. These tests write such history the
  // way it was stored.
  const send = (body) => db.tx(null, async (t) => {
    const { rows } = await t.query('select id, tag, status, status_at, facility_id from assets where id = any($1::uuid[])', [body.engines.map((e) => e.srd_asset_id)]);
    let updated = 0;
    for (const { srd_asset_id: assetId, ...r } of body.engines) {
      const a = rows.find((x) => x.id === assetId);
      await keepEngineReport(t, a.id, body.report_month, body.reported_on, r, { source: 'fleet_manager', userId: null });
      updated += await setLatest(t, a, body.report_month, body.reported_on, r, { source: 'fleet_manager', userId: null });
      if (r.last_alt_service_on) {
        await t.query(`insert into maintenance_events (asset_id, kind, done_on, source, origin) values ($1, 'alternator_service', $2, 'report', 'fleet_manager')
                       on conflict (asset_id, kind, done_on) do nothing`, [a.id, r.last_alt_service_on]);
      }
    }
    const p = { source: 'fleet_manager', reported_on: body.reported_on, peak_load_kw: body.peak_load?.kw, peak_load_at: body.peak_load?.at,
      genset_count: body.engines.length, file_name: body.file_name, held_rows: body.held_rows, source_ref: body.source_ref, userId: null };
    await keepPowerhouseReport(t, body.facility_id || rows[0].facility_id, body.report_month, p);
    const latest = await setLatestPowerhouse(t, body.facility_id || rows[0].facility_id, body.report_month, p);
    return { status: 200, body: { latest: !!latest, engines_updated: updated } };
  });

  test('uploads are kept month by month', async () => {
    const h = (await call('GET', `/condition-reports/history?asset_id=${gensets[0].id}`, { token: admin })).body;
    assert.ok(h.engines.length >= 2, 'every month in the workbook, not only the latest');
    assert.ok(h.engines.every((r) => r.source === 'upload'));
    assert.deepEqual(h.powerhouse.map((r) => r.report_month).slice(0, 2), [EXPECTED, PREVIOUS]);
  });

  test('a report from Fleet Manager became the latest and is kept next to the upload', async () => {
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

  test('work logged from a fault clears it from Needs attention when completed; work is assigned to a person', async () => {
    // Dhigurah G2 has a major fault and is still running.
    const g2 = gensets.find((g) => g.tag === '2');
    await call('POST', '/assets/status', { token: admin, body: { items: [{ asset_id: g2.id, status: 'running' }] } });
    const set = await call('POST', `/assets/${g2.id}/fault`, { token: admin, body: { level: 'major', note: 'Turbo noise' } });
    assert.equal(set.status, 200, JSON.stringify(set.body));
    assert.equal((await call('POST', `/assets/${g2.id}/fault`, { token: admin, body: { level: 'minor' } })).status, 400, 'a fault needs a description');
    const attention = async () => (await call('GET', `/services/electricity?atoll_id=${dhigurah.atoll_id}`, { token: admin })).body.attention;
    assert.ok((await attention()).some((a) => a.id === g2.id && a.fault === 'Turbo noise'));

    const people = (await call('GET', '/users/directory', { token: admin })).body;
    const person = people.find((p) => p.technical);
    const w = await call('POST', '/work', { token: admin, body: {
      asset_id: g2.id, kind: 'repair', title: 'Genset 2: Turbo noise', fault_report_month: EXPECTED, assigned_user_id: person.id, assigned_to: 'Mechanical team' } });
    assert.equal(w.status, 201, JSON.stringify(w.body));
    assert.equal(w.body.assigned_user_name, person.full_name);
    assert.ok((await attention()).find((a) => a.id === g2.id).work_title, 'listed with its work while open');
    const mine = (await call('GET', `/work?assignee=${person.id}`, { token: admin })).body.items;
    assert.deepEqual(mine.map((x) => x.id), [w.body.id]);

    await call('POST', `/work/${w.body.id}/updates`, { token: admin, body: { body: 'Turbo replaced', status: 'completed' } });
    assert.ok(!(await attention()).some((a) => a.id === g2.id), 'cleared once the work is completed');
    assert.equal((await call('GET', `/assets/${g2.id}`, { token: admin })).body.condition.condition, 'ok');
    // Recorded again: back on the list.
    await call('POST', `/assets/${g2.id}/fault`, { token: admin, body: { level: 'major', note: 'Turbo noise again' } });
    assert.ok((await attention()).some((a) => a.id === g2.id));

    const svc = (await db.query("select id from users where service_account limit 1")).rows[0];
    if (svc) assert.equal((await call('PATCH', `/work/${w.body.id}`, { token: admin, body: { assigned_user_id: svc.id } })).status, 400);
  });

  test('gensets are always rated in kW; K. Kudagiri is on the register', async () => {
    const ph = (await db.query("select id from facilities where island_id = $1 and kind = 'powerhouse' order by created_at limit 1", [maafushi.id])).rows[0].id;
    const made = await call('POST', '/assets', { token: admin, body: { facility_id: ph, kind: 'genset', tag: '31', capacity_unit: 'KVA', rated_capacity: 500 } });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    assert.equal(made.body.capacity_unit, 'kW');
    assert.equal((await call('PATCH', `/assets/${made.body.id}`, { token: admin, body: { capacity_unit: 'kw ' } })).body.capacity_unit, 'kW');
    const kudagiri = (await call('GET', '/islands', { token: admin })).body.find((i) => i.name === 'Kudagiri');
    assert.equal(kudagiri?.atoll_code, 'K');
    const island = (await call('GET', `/islands/${kudagiri.id}`, { token: admin })).body;
    assert.deepEqual(island.facilities.map((f) => f.name), ['Kudagiri Powerhouse']);
  });
});

describe('monthly genset updates', () => {
  let huraa, ph, form;
  const thisMonth = () => `${mvToday().slice(0, 7)}-01`;
  before(async () => {
    huraa = (await call('GET', '/islands', { token: admin })).body.find((i) => i.name === 'Huraa');
    ph = (await db.query("select id from facilities where island_id = $1 and kind = 'powerhouse' and active", [huraa.id])).rows[0].id;
    form = (await call('GET', `/facilities/${ph}/genset-update`, { token: admin })).body;
  });
  const send = (token, items) => call('POST', `/facilities/${ph}/genset-update`, { token, body: { items } });

  test('the form lists the powerhouse\'s gensets with their last figures', async () => {
    assert.ok(form.gensets.length >= 2, JSON.stringify(form));
    assert.equal(form.powerhouse.island_name, 'Huraa');
    assert.equal(form.expected_month, EXPECTED);
    assert.ok(form.gensets.every((g) => g.total_hours == null));
  });

  test('only managers of the island update it; faults need a description', async () => {
    const [g1] = form.gensets;
    assert.equal((await send(manager, [{ asset_id: g1.id, total_hours: 100, condition: 'ok' }])).status, 403, 'Maafushi\'s manager');
    const r = await send(admin, [{ asset_id: g1.id, total_hours: 100, condition: 'minor_fault' }]);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /fault/);
    const other = (await db.query("select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.kind = 'genset' limit 1", [maafushi.id])).rows[0].id;
    assert.equal((await send(admin, [{ asset_id: other, total_hours: 1, condition: 'ok' }])).status, 400, 'another powerhouse\'s genset');
  });

  test('an update sets each genset\'s condition and hours, and the powerhouse is up to date', async () => {
    const [g1, g2] = form.gensets;
    // G1 was overhauled at 900 hours before this first update.
    await call('POST', `/assets/${g1.id}/maintenance`, { token: admin, body: { kind: 'overhaul', done_on: mvToday(), running_hours: 900 } });
    const res = await send(admin, [
      { asset_id: g1.id, total_hours: 1000, condition: 'ok' },
      { asset_id: g2.id, total_hours: 5000, condition: 'minor_fault', fault: 'Coolant leak', alt_needs_service: true },
    ]);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.month, thisMonth());
    // Not every genset yet: the powerhouse is still due, and says which.
    const rest = form.gensets.slice(2);
    assert.equal(res.body.complete, rest.length === 0);
    assert.deepEqual(res.body.still_due, rest.map((g) => g.tag));
    if (rest.length) {
      const due = (await call('GET', '/condition-reports', { token: admin })).body.powerhouses.find((p) => p.facility_id === ph);
      assert.equal(due.state, 'never');
      // The others, hours only: condition stays as last recorded.
      const done = await send(admin, rest.map((g, i) => ({ asset_id: g.id, total_hours: 100 + i })));
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(done.body.complete, true);
    }

    const a1 = (await call('GET', `/assets/${g1.id}`, { token: admin })).body;
    assert.equal(a1.condition.condition, 'ok');
    assert.equal(Number(a1.condition.total_hours), 1000);
    assert.equal(Number(a1.condition.hours_since_overhaul), 100, 'from the overhaul recorded before it');
    const a2 = (await call('GET', `/assets/${g2.id}`, { token: admin })).body;
    assert.equal(a2.condition.fault, 'Coolant leak');
    assert.equal(a2.engine.alt_service_due, true);

    const t = (await call('GET', '/condition-reports', { token: admin })).body.powerhouses.find((p) => p.facility_id === ph);
    assert.equal(t.state, 'up_to_date');
    assert.equal(t.source, 'update');
    assert.equal(t.uploaded_by_name, 'Admin');
    const h = (await call('GET', `/condition-reports/history?asset_id=${g1.id}`, { token: admin })).body;
    assert.deepEqual(h.engines.map((r) => [r.report_month, r.source]), [[thisMonth(), 'update']]);
    assert.ok(a1.hours_log.some((x) => x.month === thisMonth() && Number(x.total_hours) === 1000));
  });

  test('hours carry forward; a lower reading needs "meter replaced"', async () => {
    const [g1] = form.gensets;
    let r = await send(admin, [{ asset_id: g1.id, total_hours: 1200, condition: 'ok' }]);
    assert.equal(r.status, 200);
    assert.equal(Number((await call('GET', `/assets/${g1.id}`, { token: admin })).body.condition.hours_since_overhaul), 300, '100 + 200 run since');
    r = await send(admin, [{ asset_id: g1.id, total_hours: 50, condition: 'ok' }]);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /less than the last reading \(1200\)/);
    r = await send(admin, [{ asset_id: g1.id, total_hours: 50, meter_replaced: true, condition: 'ok' }]);
    assert.equal(r.status, 200);
    assert.equal((await call('GET', `/assets/${g1.id}`, { token: admin })).body.condition.hours_since_overhaul, null, 'unknown after a new meter');
  });

  test('status and faults are set directly; back in service clears the faults', async () => {
    const [g1] = form.gensets;
    const state = async () => (await db.query('select status, fault_level, fault_note from assets where id = $1', [g1.id])).rows[0];
    let r = await send(admin, [{ asset_id: g1.id, total_hours: 1300, status: 'maintenance', fault_level: 'minor', fault: 'Fuel filter blocked' }]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(await state(), { status: 'maintenance', fault_level: 'minor', fault_note: 'Fuel filter blocked' });
    assert.equal((await send(admin, [{ asset_id: g1.id, total_hours: 1300, fault_level: 'major' }])).status, 400, 'a new fault level needs its description');
    r = await send(admin, [{ asset_id: g1.id, total_hours: 1310, status: 'running' }]);
    assert.equal(r.status, 200);
    assert.deepEqual(await state(), { status: 'running', fault_level: 'none', fault_note: null });
    const h = (await call('GET', `/condition-reports/history?asset_id=${g1.id}`, { token: admin })).body.engines[0];
    assert.equal(h.condition, 'ok', 'the month is kept with the state it ended in');
  });

  test('every fault is logged, with who cleared it and why', async () => {
    const [g1] = form.gensets;
    const log = async () => (await call('GET', `/assets/${g1.id}`, { token: admin })).body.fault_log;
    const before = (await log()).length;
    await call('POST', `/assets/${g1.id}/fault`, { token: admin, body: { level: 'minor', note: 'Exhaust leak' } });
    await call('POST', `/assets/${g1.id}/fault`, { token: admin, body: { level: 'major', note: 'Exhaust manifold cracked' } });
    let l = await log();
    assert.equal(l.length, before + 2);
    assert.deepEqual([l[0].level, l[0].note, l[0].cleared_at], ['major', 'Exhaust manifold cracked', null]);
    assert.equal(l[1].cleared_reason, 'Replaced by a newer fault');
    assert.equal(l[0].logged_by_name, 'Admin');
    // Down, then back in service: cleared, saying why.
    await call('POST', '/assets/status', { token: admin, body: { items: [{ asset_id: g1.id, status: 'down', note: 'manifold' }] } });
    await call('POST', '/assets/status', { token: admin, body: { items: [{ asset_id: g1.id, status: 'running' }] } });
    l = await log();
    assert.equal(l[0].cleared_reason, 'Back in service');
    assert.equal(l[0].cleared_by_name, 'Admin');
    // Marked fixed by hand.
    await call('POST', `/assets/${g1.id}/fault`, { token: admin, body: { level: 'minor', note: 'Loose belt' } });
    await call('POST', `/assets/${g1.id}/fault`, { token: admin, body: { level: 'none' } });
    assert.equal((await log())[0].cleared_reason, 'Marked fixed');
    // Completed work logged from the fault says which work.
    await call('POST', `/assets/${g1.id}/fault`, { token: admin, body: { level: 'major', note: 'Turbo whine' } });
    const w = (await call('POST', '/work', { token: admin, body: { asset_id: g1.id, kind: 'repair', title: 'Turbo', fault_report_month: thisMonth() } })).body;
    await call('PATCH', `/work/${w.id}`, { token: admin, body: { status: 'completed' } });
    assert.equal((await log())[0].cleared_reason, `Work ${w.ref} completed`);
  });

  test('not running sets the genset down (opening work); a disconnected genset stays disconnected', async () => {
    const [, g2, g3] = form.gensets;
    await call('POST', '/assets/status', { token: admin, body: { items: [{ asset_id: g3.id, status: 'disconnected', note: 'Not connected to the panel' }] } });
    const r = await send(admin, [
      { asset_id: g2.id, total_hours: 5100, condition: 'not_running', fault: 'Crankshaft' },
      { asset_id: g3.id, total_hours: 1000, condition: 'not_running', fault: 'Disconnected' },
    ]);
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const status = async (id) => (await db.query('select status, status_note from assets where id = $1', [id])).rows[0];
    assert.equal((await status(g2.id)).status, 'down');
    assert.match((await status(g2.id)).status_note, /^Monthly update \d{4}-\d{2}: NOT RUNNING — Crankshaft/);
    assert.equal((await call('GET', `/work?asset_id=${g2.id}`, { token: admin })).body.items.length, 1, 'down opens work');
    assert.equal((await status(g3.id)).status, 'disconnected');
  });
});
