// End-to-end API tests against an in-memory Postgres (PGlite).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { createSession } from '../src/auth.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seedRegister } from '../scripts/seed.js';

let app, db;
const PASSWORD = 'correct horse 42';

async function call(method, url, { token, body, headers = {} } = {}) {
  const res = await app.inject({
    method, url: `/api/v1${url}`,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body !== undefined ? { payload: body } : {}),
  });
  let json;
  try { json = res.json(); } catch { json = undefined; }
  return { status: res.statusCode, body: json, raw: res };
}

async function login(email, password = PASSWORD) {
  const res = await call('POST', '/auth/login', { body: { email, password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

// Log in with a temporary password and replace it, as a new user would.
async function firstLogin(email, temp) {
  const token = await login(email, temp);
  const res = await call('POST', '/auth/password', { token, body: { current_password: temp, new_password: PASSWORD } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.token;
}

// The server works in Maldives time; so must the test, or it fails late in the UTC day.
const yesterday = () => new Date(Date.now() - 86400_000).toLocaleDateString('en-CA', { timeZone: 'Indian/Maldives' });

let admin, islands, maafushi, dhigurah, maafushiPowerhouse, dhigurahPowerhouse;

before(async () => {
  // Default: in-memory Postgres. TEST_DATABASE_URL runs the same tests on a real
  // PostgreSQL server; that database is WIPED first, so only use a throwaway one.
  const url = process.env.TEST_DATABASE_URL;
  db = await createDb(url ? { databaseUrl: url, databasePoolSize: 5 } : { pgliteDir: ':memory:' });
  if (url) await db.exec('drop schema public cascade; create schema public;');
  await migrate(db, {});
  await seedRegister(db);
  app = await buildApp({ db, config: loadConfig({ timezone: 'Indian/Maldives', webDist: '/nonexistent' }), logger: false });
  await db.query(
    `insert into users (email, full_name, role, password_hash, must_change_password) values ($1, 'Admin', 'admin', $2, false)`,
    ['admin@srd.mv', await hashPassword(PASSWORD)]);
  admin = await login('admin@srd.mv');
  islands = (await call('GET', '/islands', { token: admin })).body;
  maafushi = islands.find((i) => i.name === 'Maafushi');
  dhigurah = islands.find((i) => i.name === 'Dhigurah');
  maafushiPowerhouse = (await call('GET', `/facilities?island_id=${maafushi.id}`, { token: admin })).body[0];
  dhigurahPowerhouse = (await call('GET', `/facilities?island_id=${dhigurah.id}`, { token: admin })).body[0];
});

after(async () => {
  await app?.close();
  await db?.close();
});

describe('authentication', () => {
  test('health is public, everything else needs a session', async () => {
    assert.equal((await call('GET', '/health')).status, 200);
    assert.equal((await call('GET', '/islands')).status, 401);
    assert.equal((await call('GET', '/islands', { token: 'bogus' })).status, 401);
  });

  test('wrong password is rejected with a generic message', async () => {
    const res = await call('POST', '/auth/login', { body: { email: 'admin@srd.mv', password: 'nope' } });
    assert.equal(res.status, 401);
    const unknown = await call('POST', '/auth/login', { body: { email: 'nobody@srd.mv', password: 'nope' } });
    assert.equal(unknown.body.error, res.body.error);
  });

  test('temporary password must be changed before using the system', async () => {
    await call('POST', '/users', { token: admin, body: { email: 'new@srd.mv', full_name: 'New', role: 'viewer', password: 'Temporary123' } });
    const temp = await login('new@srd.mv', 'Temporary123');
    assert.equal((await call('GET', '/islands', { token: temp })).status, 403);
    const weak = await call('POST', '/auth/password', { token: temp, body: { current_password: 'Temporary123', new_password: 'short' } });
    assert.equal(weak.status, 400);
    const res = await call('POST', '/auth/password', { token: temp, body: { current_password: 'Temporary123', new_password: PASSWORD } });
    assert.equal(res.status, 200);
    assert.equal((await call('GET', '/islands', { token: temp })).status, 401, 'old session is revoked');
    assert.equal((await call('GET', '/islands', { token: res.body.token })).status, 200);
  });

  test('cookie sessions refuse cross-site writes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: 'admin@srd.mv', password: PASSWORD } });
    const cookie = res.cookies.find((c) => c.name === 'srd_session');
    assert.ok(cookie?.httpOnly);
    const evil = await app.inject({
      method: 'POST', url: '/api/v1/assets/status',
      headers: { cookie: `srd_session=${cookie.value}`, origin: 'https://evil.example' },
      payload: { items: [] },
    });
    assert.equal(evil.statusCode, 403);
  });

  test('deactivating a user ends their sessions', async () => {
    await call('POST', '/users', { token: admin, body: { email: 'leaver@srd.mv', full_name: 'Leaver', role: 'viewer', password: 'Temporary123' } });
    const token = await firstLogin('leaver@srd.mv', 'Temporary123');
    const users = (await call('GET', '/users', { token: admin })).body;
    const leaver = users.find((u) => u.email === 'leaver@srd.mv');
    await call('PATCH', `/users/${leaver.id}`, { token: admin, body: { active: false } });
    assert.equal((await call('GET', '/islands', { token })).status, 401);
  });
});

describe('asset register', () => {
  test('seeded register matches the SRD data', async () => {
    assert.equal(islands.length, 43, "34 SRD islands + 8 Alif Alif + K. Kudagiri (no gensets yet)");
    const assets = (await call('GET', '/assets?kind=genset&limit=500', { token: admin })).body;
    assert.equal(assets.total, 140);
    assert.equal(maafushi.genset_count, 8);
    assert.equal(maafushi.installed_kw, 9680);
    assert.equal(maafushi.genset_states.length, 8, 'one state per genset, for the island cards');
    assert.ok('open_work' in maafushi && 'licences_expired' in maafushi);
  });

  test('island detail lists facilities with their assets', async () => {
    const res = await call('GET', `/islands/${dhigurah.id}`, { token: admin });
    assert.equal(res.status, 200);
    assert.equal(res.body.facilities[0].assets.length, 5);
    assert.deepEqual(res.body.facilities[0].assets.map((a) => a.tag), ['1', '2', '3', '4', '5']);
    assert.equal(res.body.can_edit, true);
  });

  test('admin can add a water plant and RO unit', async () => {
    const f = await call('POST', '/facilities', { token: admin, body: {
      island_id: maafushi.id, service: 'water', kind: 'water_plant', name: 'Maafushi RO Plant', water_capacity_m3: 500 } });
    assert.equal(f.status, 201, JSON.stringify(f.body));
    const a = await call('POST', '/assets', { token: admin, body: {
      facility_id: f.body.id, kind: 'ro_unit', tag: 'RO-1', rated_capacity: 200, capacity_unit: 'm3/day' } });
    assert.equal(a.status, 201);
    const dup = await call('POST', '/assets', { token: admin, body: { facility_id: f.body.id, kind: 'ro_unit', tag: 'RO-1' } });
    assert.equal(dup.status, 409);
  });

  test('CSV export', async () => {
    const res = await call('GET', `/assets?island_id=${maafushi.id}&format=csv`, { token: admin });
    assert.equal(res.status, 200);
    assert.match(res.raw.headers['content-type'], /text\/csv/);
    assert.match(res.raw.body, /Atoll,Island,Facility/);
  });
});

describe('roles and island scope', () => {
  let islandManager, viewer, manager;

  before(async () => {
    await call('POST', '/users', { token: admin, body: {
      email: 'maafushi.mgr@srd.mv', full_name: 'Maafushi Manager', role: 'manager', password: 'Temporary123', scopes: [{ island_id: maafushi.id }] } });
    await call('POST', '/users', { token: admin, body: {
      email: 'viewer@srd.mv', full_name: 'Viewer', role: 'viewer', password: 'Temporary123' } });
    await call('POST', '/users', { token: admin, body: {
      email: 'mgr@srd.mv', full_name: 'K Manager', role: 'manager', password: 'Temporary123', scopes: [{ atoll_id: maafushi.atoll_id }] } });
    islandManager = await firstLogin('maafushi.mgr@srd.mv', 'Temporary123');
    viewer = await firstLogin('viewer@srd.mv', 'Temporary123');
    manager = await firstLogin('mgr@srd.mv', 'Temporary123');
  });

  test('there are no operator accounts any more', async () => {
    const res = await call('POST', '/users', { token: admin, body: {
      email: 'op@srd.mv', full_name: 'Operator', role: 'operator', password: 'Temporary123' } });
    assert.equal(res.status, 400);
    await assert.rejects(db.query(
      "insert into users (email, full_name, role, password_hash) values ('x@srd.mv', 'X', 'operator', 'x')"));
  });

  test('a manager reports incidents and asset status for their islands only', async () => {
    const ok = await call('POST', '/incidents', { token: islandManager, body: {
      service: 'electricity', island_id: maafushi.id, category: 'breakdown', title: 'Genset 2 tripped', started_at: '2026-09-30T08:00:00+05:00' } });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const other = await call('POST', '/incidents', { token: islandManager, body: {
      service: 'electricity', island_id: dhigurah.id, category: 'breakdown', title: 'x', started_at: '2026-09-30T08:00:00+05:00' } });
    assert.equal(other.status, 403);

    const [maafushiGenset] = (await call('GET', `/islands/${maafushi.id}`, { token: islandManager })).body.facilities[0].assets;
    const [dhigurahGenset] = (await call('GET', `/islands/${dhigurah.id}`, { token: islandManager })).body.facilities[0].assets;
    const status = await call('POST', '/assets/status', { token: islandManager, body: { items: [{ asset_id: maafushiGenset.id, status: 'running' }] } });
    assert.equal(status.status, 200);
    const foreign = await call('POST', '/assets/status', { token: islandManager, body: { items: [{ asset_id: dhigurahGenset.id, status: 'down' }] } });
    assert.equal(foreign.status, 403);
    // Reset, so the dashboard counts in later tests start clean.
    await db.query("update assets set status = 'unknown', status_at = null where id = $1", [maafushiGenset.id]);
  });

  test('viewers can look but not change anything', async () => {
    assert.equal((await call('GET', '/islands', { token: viewer })).status, 200);
    const v = await call('POST', '/assets/status', { token: viewer, body: { items: [{ asset_id: maafushiPowerhouse.id, status: 'down' }] } });
    assert.equal(v.status, 403);
    const i = await call('POST', '/incidents', { token: viewer, body: {
      service: 'electricity', island_id: maafushi.id, category: 'outage', title: 'x', started_at: '2026-09-30T08:00:00+05:00' } });
    assert.equal(i.status, 403);
    assert.equal((await call('GET', '/users', { token: viewer })).status, 403);
  });

  test('atoll manager can manage facilities in their atoll only', async () => {
    const k = await call('POST', '/facilities', { token: manager, body: {
      island_id: maafushi.id, service: 'sewerage', kind: 'sewerage_plant', name: 'Maafushi STP' } });
    assert.equal(k.status, 201);
    const adh = await call('POST', '/facilities', { token: manager, body: {
      island_id: dhigurah.id, service: 'sewerage', kind: 'sewerage_plant', name: 'Dhigurah STP' } });
    assert.equal(adh.status, 403);
  });

  test('regional projects need region-wide rights', async () => {
    const res = await call('POST', '/projects', { token: manager, body: { service: 'electricity', title: 'Regional SCADA' } });
    assert.equal(res.status, 403);
  });
});

describe('scope of the system', () => {
  test('the daily log, import and monthly report are gone', async () => {
    for (const url of [`/readings/sheet?facility_id=${maafushiPowerhouse.id}&date=${yesterday()}`, '/metrics',
      '/reports/monthly?month=2026-01&service=electricity']) {
      assert.equal((await call('GET', url, { token: admin })).status, 404, url);
    }
    assert.equal((await call('POST', '/readings/import', { token: admin, body: { csv: 'a' } })).status, 404);
  });

});

describe('operations', () => {
  test('asset status updates keep history and feed the dashboard', async () => {
    const island = (await call('GET', `/islands/${dhigurah.id}`, { token: admin })).body;
    const [g1, g2] = island.facilities[0].assets;
    const res = await call('POST', '/assets/status', { token: admin, body: { items: [
      { asset_id: g1.id, status: 'running' },
      { asset_id: g2.id, status: 'down', note: 'Turbo failure, awaiting parts' },
    ] } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const asset = (await call('GET', `/assets/${g2.id}`, { token: admin })).body;
    assert.equal(asset.status, 'down');
    assert.equal(asset.history.length, 1);
    const dash = (await call('GET', '/dashboard', { token: admin })).body;
    assert.equal(dash.services.electricity.down, 1);
    assert.equal(dash.services.electricity.running, 1);
    assert.ok(dash.assets_down.some((a) => a.id === g2.id));
    assert.equal(dash.yesterday, undefined, 'no daily-log figures any more');
  });

  test('incident lifecycle', async () => {
    const created = await call('POST', '/incidents', { token: admin, body: {
      service: 'electricity', island_id: dhigurah.id, facility_id: dhigurahPowerhouse.id, category: 'outage',
      severity: 'high', title: 'Island-wide blackout', started_at: '2026-09-28T10:00:00+05:00', customers_affected: 900 } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.status, 'open');
    assert.match(created.body.ref, /^INT-\d{6}$/);

    const wrongIsland = await call('POST', '/incidents', { token: admin, body: {
      service: 'electricity', island_id: maafushi.id, facility_id: dhigurahPowerhouse.id, category: 'outage',
      title: 'x', started_at: '2026-09-28T10:00:00+05:00' } });
    assert.equal(wrongIsland.status, 400);

    const resolved = await call('PATCH', `/incidents/${created.body.id}`, { token: admin, body: {
      status: 'resolved', resolved_at: '2026-09-28T11:30:00+05:00', resolution: 'Restarted genset 4' } });
    assert.equal(resolved.body.status, 'resolved');
    assert.equal(resolved.body.duration_minutes, 90);
    assert.equal(resolved.body.resolved_by_name, 'Admin');

    const before = await call('PATCH', `/incidents/${created.body.id}`, { token: admin, body: { resolved_at: '2026-09-28T09:00:00+05:00' } });
    assert.equal(before.status, 400, 'resolved before it started');
  });

  test('project updates move progress', async () => {
    const p = await call('POST', '/projects', { token: admin, body: {
      service: 'electricity', island_id: maafushi.id, title: 'Genset 9 installation', status: 'ongoing', target_date: '2026-12-31' } });
    assert.equal(p.status, 201, JSON.stringify(p.body));
    const u = await call('POST', `/projects/${p.body.id}/updates`, { token: admin, body: { body: 'Foundation poured', progress_pct: 40 } });
    assert.equal(u.status, 201);
    const detail = (await call('GET', `/projects/${p.body.id}`, { token: admin })).body;
    assert.equal(detail.progress_pct, 40);
    assert.equal(detail.updates.length, 1);
    const patched = await call('PATCH', `/projects/${p.body.id}`, { token: admin, body: { contractor: 'ABC Pvt Ltd' } });
    assert.equal(patched.body.progress_pct, 40, 'PATCH does not reset unspecified fields');
    // (Besides the Powerhouse Takeover, added by migration 041.)
    const active = (await call('GET', '/projects?status=active', { token: admin })).body;
    assert.deepEqual(active.items.map((x) => x.title).filter((t) => t !== 'Powerhouse Takeover'), ['Genset 9 installation']);
    const dash = (await call('GET', '/dashboard', { token: admin })).body;
    assert.deepEqual(dash.projects.list.map((x) => x.title).filter((t) => t !== 'Powerhouse Takeover'), ['Genset 9 installation']);
  });

  test('audit log records who changed what', async () => {
    const res = await call('GET', '/audit?entity=incidents', { token: admin });
    assert.ok(res.body.items.length >= 2);
    const update = res.body.items.find((e) => e.action === 'update');
    assert.equal(update.user_name, 'Admin');
    assert.equal(update.changes.status.to, 'resolved');
    const users = await call('GET', '/audit?entity=users', { token: admin });
    assert.ok(users.body.items.every((e) => !JSON.stringify(e.changes).includes('scrypt')), 'password hashes are never logged');
  });
});

describe('powerhouse takeover tracker', () => {
  let project, clerk, outsider;
  before(async () => {
    // The test data has no F, Dh or Th islands: add one, then run the seed
    // again (it is keyed, so nothing is duplicated) to give it its lists.
    const atoll = (await call('POST', '/atolls', { token: admin, body: { code: 'F', name: 'Faafu' } })).body;
    const island = (await call('POST', '/islands', { token: admin, body: { atoll_id: atoll.id, name: 'Nilandhoo' } })).body;
    await call('POST', '/facilities', { token: admin, body: { island_id: island.id, service: 'electricity', kind: 'powerhouse', name: 'Nilandhoo Powerhouse' } });
    const seed = readFileSync(new URL('../migrations/041_powerhouse_takeover.sql', import.meta.url), 'utf8');
    await db.exec(seed);
    await db.exec(seed);
    const list = (await call('GET', '/projects?q=Powerhouse%20Takeover', { token: admin })).body;
    assert.equal(list.items.filter((p) => p.title === 'Powerhouse Takeover').length, 1);
    project = list.items.find((p) => p.title === 'Powerhouse Takeover');
    const unit = (await db.query("select id from units where name = 'Administration and Support Service Unit'")).rows[0].id;
    for (const [email, unitId] of [['clerk@srd.mv', unit], ['outsider@srd.mv', null]]) {
      const res = await call('POST', '/users', { token: admin, body: { email, full_name: email, role: 'staff', password: 'Temporary123', ...(unitId ? { unit_id: unitId } : { designation: 'General Manager' }) } });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }
    // Sessions made directly: the login limit is used up by earlier tests.
    const session = async (email) => {
      await db.query('update users set must_change_password = false where email = $1', [email]);
      const { rows: [u] } = await db.query('select id from users where email = $1', [email]);
      return (await createSession(db, u.id, { ttlHours: 1, ip: null, userAgent: 'test' })).token;
    };
    clerk = await session('clerk@srd.mv');
    outsider = await session('outsider@srd.mv');
  });

  test('seeded from the workbook: 26 tasks, owned by the Admin unit, one set of lists per site', async () => {
    assert.ok(project, 'project exists');
    const p = (await call('GET', `/projects/${project.id}`, { token: admin })).body;
    assert.equal(p.tracker, true);
    assert.equal(p.tasks.length, 26);
    assert.equal(p.tasks[0].code, 'TKO-001');
    assert.equal(p.tasks[0].unit_name, 'Administration and Support Service Unit');
    assert.ok(p.tasks.every((t) => t.status === 'Not Started' && t.priority >= 1));
    assert.equal(p.tasks.filter((t) => t.priority === 1).length, 17);
    assert.equal(p.visibility, 'members');
    assert.equal(p.sites.length, 1, 'the F island added above');
    assert.ok(p.sites.every((s) => ['F', 'Dh', 'Th'].includes(s.atoll_code) && s.access_total === 10 && s.checklist_total === 55));
  });

  test('Admin unit members can view; others cannot; viewers cannot change tasks', async () => {
    assert.equal((await call('GET', `/projects/${project.id}`, { token: clerk })).status, 200);
    assert.equal((await call('GET', `/projects/${project.id}`, { token: outsider })).status, 404);
    const p = (await call('GET', `/projects/${project.id}`, { token: clerk })).body;
    const res = await call('PATCH', `/projects/${project.id}/tasks/${p.tasks[0].id}`, { token: clerk, body: { status: 'In Progress' } });
    assert.equal(res.status, 403);
  });

  test('tasks are updated one at a time; completing sets 100% and the date; progress is the average', async () => {
    const p = (await call('GET', `/projects/${project.id}`, { token: admin })).body;
    const [a, b, c] = p.tasks;
    let res = await call('PATCH', `/projects/${project.id}/tasks/${a.id}`, { token: admin, body: { status: 'Completed' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.progress, 100);
    assert.ok(res.body.completed_date);
    assert.equal(res.body.code, 'TKO-001', 'the code stays');
    res = await call('PATCH', `/projects/${project.id}/tasks/${b.id}`, { token: admin, body: { progress: 50, due_date: '2020-01-01', remarks: 'Waiting on HR' } });
    assert.equal(res.body.status, 'In Progress', 'started work moves to In Progress');
    assert.equal(res.body.overdue, true);
    res = await call('PATCH', `/projects/${project.id}/tasks/${c.id}`, { token: admin, body: { status: 'Cancelled' } });
    const after = (await call('GET', `/projects/${project.id}`, { token: admin })).body;
    assert.equal(Number(after.progress_pct), Math.round((150 / 25) * 10) / 10, 'average of the 25 tasks not cancelled');
    res = await call('PATCH', `/projects/${project.id}/tasks/${a.id}`, { token: admin, body: { status: 'On Hold' } });
    assert.equal(res.body.completed_date, null, 'leaving Completed clears the date');
    assert.equal((await call('PATCH', `/projects/${project.id}/tasks/${a.id}`, { token: admin, body: { status: 'Done' } })).status, 400);
    // Tasks can be added (numbered after the last) and deleted.
    res = await call('POST', `/projects/${project.id}/tasks`, { token: admin, body: { name: 'Hand over the store keys', priority: 1, responsible_dept: 'Store' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.code, 'TKO-027');
    assert.equal(res.body.status, 'Not Started');
    assert.equal(res.body.unit_name, 'Administration and Support Service Unit');
    assert.equal((await call('POST', `/projects/${project.id}/tasks`, { token: clerk, body: { name: 'x' } })).status, 403);
    assert.equal((await call('DELETE', `/projects/${project.id}/tasks/${res.body.id}`, { token: clerk })).status, 403);
    assert.equal((await call('DELETE', `/projects/${project.id}/tasks/${res.body.id}`, { token: admin })).status, 200);
    assert.equal((await call('GET', `/projects/${project.id}`, { token: admin })).body.tasks.length, 26);
    // The whole-list editor can't overwrite tracked tasks.
    res = await call('PATCH', `/projects/${project.id}`, { token: admin, body: { tasks: [{ name: 'x', progress: 0 }] } });
    assert.equal(res.status, 400);
  });

  test('each site has its access list and checklists', async () => {
    const p = (await call('GET', `/projects/${project.id}`, { token: admin })).body;
    const site = (await call('GET', `/projects/${project.id}/sites/${p.sites[0].island_id}`, { token: admin })).body;
    assert.equal(site.access_items.length, 10);
    assert.equal(site.checklist.filter((x) => x.list === 'diesel').length, 13);
    assert.equal(site.checklist.filter((x) => x.list === 'safety_ppe').length, 18);
    const paper = site.checklist.find((x) => x.item === 'A4 paper');
    let res = await call('PATCH', `/projects/${project.id}/checklist/${paper.id}`, { token: admin, body: { available_qty: 5 } });
    assert.equal(Number(res.body.shortfall), 10);
    res = await call('PATCH', `/projects/${project.id}/access/${site.access_items[0].id}`, { token: admin, body: { status: 'Granted', granted_to: 'Site manager' } });
    assert.equal(res.body.status, 'Granted');
    assert.ok(res.body.granted_on);
    const again = (await call('GET', `/projects/${project.id}`, { token: admin })).body.sites.find((s) => s.island_id === p.sites[0].island_id);
    assert.equal(again.access_granted, 1);
    assert.equal(again.stationery_short, 1);
  });
});

describe('national takeover tracker', () => {
  test('SRD islands start it; islands elsewhere are added; per service, an island is taken over once all are', async () => {
    // The test register is filled after the migrations: run the seeding again.
    const sql = readFileSync(new URL('../migrations/053_national_takeover.sql', import.meta.url), 'utf8');
    await db.exec(sql.slice(sql.indexOf('insert into takeover_islands')));
    let t = (await call('GET', '/takeover', { token: admin })).body;
    assert.equal(t.expected_islands, 187);
    assert.equal(t.atolls.length, 20);
    // The census's inhabited islands for the atolls outside SRD, in full.
    assert.deepEqual(['HA', 'Lh', 'L', 'Gn', 'S'].map((c) => t.atolls.find((a) => a.code === c).islands), [14, 4, 11, 1, 6]);
    const k = t.atolls.find((a) => a.code === 'K');
    assert.ok(k.islands > 0 && k.taken_over === k.islands, 'Kaafu: electricity already with STELCO');
    const maafushiRow = t.islands.find((i) => i.name === 'Maafushi');
    assert.equal(maafushiRow.island_id, maafushi.id);
    assert.equal(maafushiRow.state, 'taken_over');
    assert.ok(t.islands.filter((i) => i.atoll_code === 'HA').every((i) => i.lat != null && i.lon != null), 'islands have their place on the map');

    // An island outside SRD, still with FENAKA.
    const add = await call('POST', '/takeover/islands', { token: admin, body: {
      atoll_code: 'HA', name: 'Testfushi', phase: 'Phase 3', electricity_status: 'pending', electricity_on: '2026-12-01', water_status: 'pending' } });
    assert.equal(add.status, 201, JSON.stringify(add.body));
    assert.equal(add.body.state, 'pending');
    assert.equal((await call('POST', '/takeover/islands', { token: admin, body: { atoll_code: 'HA', name: 'testfushi' } })).status, 400, 'no duplicates');
    assert.equal((await call('POST', '/takeover/islands', { token: admin, body: { atoll_code: 'XX', name: 'Nowhere' } })).status, 400);

    // Electricity handed over, water not yet: still pending; then both.
    let r = await call('PATCH', `/takeover/islands/${add.body.id}`, { token: admin, body: { electricity_status: 'taken_over', electricity_on: '2026-10-14' } });
    assert.equal(r.body.state, 'pending');
    r = await call('PATCH', `/takeover/islands/${add.body.id}`, { token: admin, body: { water_status: 'taken_over', sewerage_status: 'not_applicable' } });
    assert.equal(r.body.state, 'taken_over');
    assert.equal(r.body.phase, 'Phase 3', 'other fields kept');
    t = (await call('GET', '/takeover', { token: admin })).body;
    assert.equal(t.atolls.find((a) => a.code === 'HA').taken_over, 1);
    assert.equal(t.totals.islands, t.islands.filter((i) => i.counted).length);
    // Under FENAKA without a survey, and run by another operator.
    const { islandState } = await import('../src/routes/takeover.js');
    assert.equal(islandState({ electricity_status: 'fenaka' }), 'pending');
    assert.equal(islandState({ electricity_status: 'taken_over', water_status: 'other_operator' }), 'taken_over');
    assert.equal(islandState({ electricity_status: 'other_operator', water_status: 'other_operator' }), 'other');
    assert.equal(t.islands.find((i) => i.atoll_code === 'R' && i.name === 'Dhuvaafaru').state, 'other');
    assert.equal(t.atolls.find((a) => a.code === 'R').pending, 14);
    // Vilimalé and Gulhifalhu: on the list and the map, not in the 187.
    assert.deepEqual(t.islands.filter((i) => !i.counted).map((i) => i.name).sort(), ['Gulhifalhu', 'Kudagiri', 'Thilafushi', 'Vilimalé']);
    assert.equal(t.services.water.taken_over >= 1, true);

    // Everyone sees it; only managers change it; only admins remove.
    await call('POST', '/users', { token: admin, body: { email: 'tko-viewer@srd.mv', full_name: 'Viewer', role: 'viewer', password: 'Temporary123' } });
    await db.query("update users set must_change_password = false where email = 'tko-viewer@srd.mv'");
    const { rows: [v] } = await db.query("select id from users where email = 'tko-viewer@srd.mv'");
    const viewer = (await createSession(db, v.id, { ttlHours: 1, ip: null, userAgent: 'test' })).token;
    assert.equal((await call('GET', '/takeover', { token: viewer })).status, 200);
    assert.equal((await call('PATCH', `/takeover/islands/${add.body.id}`, { token: viewer, body: { phase: 'x' } })).status, 403);
    assert.equal((await call('DELETE', `/takeover/islands/${add.body.id}`, { token: admin })).status, 200);

    // A whole atoll at once: only the islands not set, unless all.
    const feydhoo = t.islands.find((i) => i.atoll_code === 'S' && i.name === 'Feydhoo');
    await call('PATCH', `/takeover/islands/${feydhoo.id}`, { token: admin, body: { electricity_status: 'pending' } });
    let bulk = await call('POST', '/takeover/atolls/S', { token: admin, body: { service: 'electricity', status: 'taken_over', on: '2025-01-01' } });
    assert.equal(bulk.body.updated, 5, 'the 5 not set; Feydhoo kept');
    t = (await call('GET', '/takeover', { token: admin })).body;
    assert.equal(t.islands.find((i) => i.id === feydhoo.id).electricity_status, 'pending');
    bulk = await call('POST', '/takeover/atolls/S', { token: admin, body: { service: 'electricity', status: 'taken_over', all: true } });
    assert.equal(bulk.body.updated, 6);
    assert.equal((await call('POST', '/takeover/atolls/S', { token: viewer, body: { service: 'water', status: 'pending' } })).status, 403);
  });
});
