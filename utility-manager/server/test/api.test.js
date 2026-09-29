// End-to-end API tests against an in-memory Postgres (PGlite).
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { buildApp } from '../src/app.js';
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
    assert.equal(islands.length, 34);
    const assets = (await call('GET', '/assets?kind=genset&limit=500', { token: admin })).body;
    assert.equal(assets.total, 140);
    assert.equal(maafushi.genset_count, 8);
    assert.equal(maafushi.installed_kw, 9680);
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
  let operator, viewer, manager;

  before(async () => {
    await call('POST', '/users', { token: admin, body: {
      email: 'op@srd.mv', full_name: 'Maafushi Operator', role: 'operator', password: 'Temporary123', scopes: [{ island_id: maafushi.id }] } });
    await call('POST', '/users', { token: admin, body: {
      email: 'viewer@srd.mv', full_name: 'Viewer', role: 'viewer', password: 'Temporary123' } });
    await call('POST', '/users', { token: admin, body: {
      email: 'mgr@srd.mv', full_name: 'K Manager', role: 'manager', password: 'Temporary123', scopes: [{ atoll_id: maafushi.atoll_id }] } });
    operator = await firstLogin('op@srd.mv', 'Temporary123');
    viewer = await firstLogin('viewer@srd.mv', 'Temporary123');
    manager = await firstLogin('mgr@srd.mv', 'Temporary123');
  });

  test('operator writes the daily log for their island only', async () => {
    const ok = await call('PUT', '/readings/sheet', { token: operator, body: {
      facility_id: maafushiPowerhouse.id, date: yesterday(), values: { gross_generation_kwh: 120000, fuel_consumed_l: 30000, peak_load_kw: 6200 } } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const other = await call('PUT', '/readings/sheet', { token: operator, body: {
      facility_id: dhigurahPowerhouse.id, date: yesterday(), values: { gross_generation_kwh: 1 } } });
    assert.equal(other.status, 403);
  });

  test('viewers cannot write; operators cannot manage assets', async () => {
    const v = await call('POST', '/assets/status', { token: viewer, body: { items: [{ asset_id: maafushiPowerhouse.id, status: 'down' }] } });
    assert.equal(v.status, 403);
    const o = await call('POST', '/facilities', { token: operator, body: { island_id: maafushi.id, service: 'water', kind: 'other', name: 'X' } });
    assert.equal(o.status, 403);
    assert.equal((await call('GET', '/users', { token: operator })).status, 403);
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

describe('daily log', () => {
  test('sheet shows entered values and rejects wrong-service metrics', async () => {
    const sheet = await call('GET', `/readings/sheet?facility_id=${maafushiPowerhouse.id}&date=${yesterday()}`, { token: admin });
    assert.equal(sheet.status, 200);
    const gen = sheet.body.metrics.find((m) => m.code === 'gross_generation_kwh');
    assert.equal(gen.value, 120000);
    assert.ok(sheet.body.metrics.every((m) => !m.code.startsWith('water_')));

    const bad = await call('PUT', '/readings/sheet', { token: admin, body: {
      facility_id: maafushiPowerhouse.id, date: yesterday(), values: { water_produced_m3: 10 } } });
    assert.equal(bad.status, 400);
    assert.match(bad.body.error, /does not apply/);
  });

  test('future dates are refused; null clears a value', async () => {
    const future = await call('PUT', '/readings/sheet', { token: admin, body: {
      facility_id: maafushiPowerhouse.id, date: '2999-01-01', values: { peak_load_kw: 1 } } });
    assert.equal(future.status, 400);
    await call('PUT', '/readings/sheet', { token: admin, body: { facility_id: maafushiPowerhouse.id, date: yesterday(), values: { peak_load_kw: null } } });
    const sheet = await call('GET', `/readings/sheet?facility_id=${maafushiPowerhouse.id}&date=${yesterday()}`, { token: admin });
    assert.equal(sheet.body.metrics.find((m) => m.code === 'peak_load_kw').value, null);
  });

  test('CSV import validates every row before writing anything', async () => {
    const csv = [
      'atoll,island,facility,date,metric,value',
      'K,Maafushi,Maafushi Powerhouse,2026-01-01,gross_generation_kwh,"100,000"',
      'K,Maafushi,Maafushi Powerhouse,2026-01-01,fuel_consumed_l,25000',
      'K,Nowhere,Nowhere Powerhouse,2026-01-01,fuel_consumed_l,1',
      'K,Maafushi,Maafushi Powerhouse,2026-01-02,fuel_consumed_l,abc',
    ].join('\n');
    const bad = await call('POST', '/readings/import', { token: admin, body: { csv } });
    assert.equal(bad.body.ok, false);
    assert.deepEqual(bad.body.errors.map((e) => e.line), [4, 5]);
    const count = await call('GET', `/readings?facility_id=${maafushiPowerhouse.id}&from=2026-01-01&to=2026-01-31`, { token: admin });
    assert.equal(count.body.length, 0);

    const good = await call('POST', '/readings/import', { token: admin, body: { csv: csv.split('\n').slice(0, 3).join('\n') } });
    assert.equal(good.body.imported, 2, JSON.stringify(good.body));
  });

  test('monthly report aggregates and computes KPIs', async () => {
    const res = await call('GET', '/reports/monthly?month=2026-01&service=electricity', { token: admin });
    assert.equal(res.status, 200);
    const row = res.body.rows.find((r) => r.facility_id === maafushiPowerhouse.id);
    assert.equal(row.values.gross_generation_kwh, 100000);
    assert.equal(row.kpis.sfc_kwh_per_l, 4);
    assert.equal(row.days_reported, 1);
    const csv = await call('GET', '/reports/monthly?month=2026-01&service=electricity&format=csv', { token: admin });
    assert.match(csv.raw.body, /Specific fuel consumption/);
  });

  test('trend returns one point per day', async () => {
    const res = await call('GET', `/reports/trend?metric=gross_generation_kwh&from=2026-01-01&to=2026-01-03&island_id=${maafushi.id}`, { token: admin });
    assert.deepEqual(res.body, [
      { date: '2026-01-01', value: 100000 }, { date: '2026-01-02', value: null }, { date: '2026-01-03', value: null },
    ]);
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
    assert.equal(dash.yesterday.gross_generation_kwh, 120000);
    assert.equal(dash.yesterday.specific_fuel_kwh_per_l, 4);
    assert.ok(dash.missing_logs.some((f) => f.id === dhigurahPowerhouse.id));
    assert.ok(!dash.missing_logs.some((f) => f.id === maafushiPowerhouse.id));
  });

  test('incident lifecycle', async () => {
    const created = await call('POST', '/incidents', { token: admin, body: {
      service: 'electricity', island_id: dhigurah.id, facility_id: dhigurahPowerhouse.id, category: 'outage',
      severity: 'high', title: 'Island-wide blackout', started_at: '2026-09-28T10:00:00+05:00', customers_affected: 900 } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.status, 'open');
    assert.match(created.body.ref, /^INC-\d{6}$/);

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
    const active = (await call('GET', '/projects?status=active', { token: admin })).body;
    assert.equal(active.total, 1);
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
