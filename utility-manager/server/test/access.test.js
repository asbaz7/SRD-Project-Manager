// Technical vs non-technical staff, work commenters, and per-project sharing.
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { seedRegister } from '../scripts/seed.js';

const PASSWORD = 'correct horse 42';
let app, db, maafushi;
const T = {};      // tokens by name
const U = {};      // user ids by name

async function call(method, url, token, body) {
  const res = await app.inject({
    method, url: `/api/v1${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body } : {}),
  });
  let json;
  try { json = res.json(); } catch { json = undefined; }
  return { status: res.statusCode, body: json };
}

before(async () => {
  db = await createDb({ pgliteDir: ':memory:' });
  await migrate(db, {});
  await seedRegister(db);
  app = await buildApp({ db, config: loadConfig({ timezone: 'Indian/Maldives', webDist: '' }), logger: false });
  const hash = await hashPassword(PASSWORD);
  const people = [
    ['admin', 'admin', true], ['tech', 'manager', true], ['tech2', 'manager', true],
    ['office', 'manager', false], ['clerk', 'viewer', false],
  ];
  for (const [name, role, technical] of people) {
    const { rows } = await db.query(
      `insert into users (email, full_name, role, technical, password_hash, must_change_password)
       values ($1, $2, $3, $4, $5, false) returning id`, [`${name}@srd.mv`, name, role, technical, hash]);
    U[name] = rows[0].id;
  }
  for (const [name] of people) T[name] = (await call('POST', '/auth/login', null, { email: `${name}@srd.mv`, password: PASSWORD })).body.token;
  maafushi = (await call('GET', '/islands', T.admin)).body.find((i) => i.name === 'Maafushi');
  for (const name of ['tech', 'tech2', 'office']) {
    await db.query('insert into user_scopes (user_id, island_id) values ($1, $2)', [U[name], maafushi.id]);
  }
});

after(async () => {
  await app?.close();
  await db?.close();
});

test('non-technical staff cannot reach engines, condition reports, assets, plants or the service sections', async () => {
  for (const url of ['/engines', '/condition-reports', '/assets', '/services/electricity', '/services/water']) {
    assert.equal((await call('GET', url, T.office)).status, 403, url);
    assert.equal((await call('GET', url, T.clerk)).status, 403, url);
    assert.equal((await call('GET', url, T.tech)).status, 200, url);
  }
  const g = (await call('GET', '/engines', T.tech)).body.engines.find((e) => e.island_name === 'Maafushi');
  assert.equal((await call('GET', `/assets/${g.id}`, T.office)).status, 403);
  assert.equal((await call('POST', '/assets/status', T.office, { items: [{ asset_id: g.id, status: 'down', note: 'x' }] })).status, 403);
  assert.equal((await call('POST', '/facilities', T.office, { island_id: maafushi.id, service: 'water', kind: 'water_plant', name: 'X' })).status, 403);
});

test('non-technical staff get the island and overview without technical details', async () => {
  const isl = (await call('GET', `/islands/${maafushi.id}`, T.office)).body;
  assert.deepEqual(isl.facilities, []);
  assert.deepEqual(isl.reports, []);
  assert.equal(isl.technical, false);
  assert.ok((await call('GET', `/islands/${maafushi.id}`, T.tech)).body.facilities.length > 0);

  const d = (await call('GET', '/dashboard', T.office)).body;
  assert.equal(d.technical, false);
  assert.equal(d.engines, null);
  assert.equal(d.reports, null);
  assert.deepEqual(d.assets_down, []);
  assert.equal(d.services.electricity.assets, 0);
  assert.ok((await call('GET', '/dashboard', T.tech)).body.engines.total > 0);
});

test('the staff type is set when creating a user, and the session reflects it', async () => {
  const res = await call('POST', '/users', T.admin, {
    email: 'new@srd.mv', full_name: 'New Clerk', role: 'viewer', technical: false, password: 'temporary1234', scopes: [],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.technical, false);
  // Administrators always count as technical.
  assert.equal((await call('GET', '/auth/me', T.admin)).body.technical, true);
  assert.equal((await call('GET', '/auth/me', T.office)).body.technical, false);
});

test('work: everyone can see it, technical staff run it, chosen people can comment', async () => {
  // Only technical staff start work.
  assert.equal((await call('POST', '/work', T.office, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'x' })).status, 403);
  const w = (await call('POST', '/work', T.tech, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Replace radiator' })).body;

  // Everyone can see it.
  assert.ok((await call('GET', '/work', T.clerk)).body.items.some((x) => x.id === w.id));
  let view = (await call('GET', `/work/${w.id}`, T.office)).body;
  assert.equal(view.can_run, false);
  assert.equal(view.can_comment, false);

  // Not added yet: no comments, and non-technical staff can't add themselves.
  assert.equal((await call('POST', `/work/${w.id}/updates`, T.office, { body: 'When will it be done?' })).status, 403);
  assert.equal((await call('POST', `/work/${w.id}/commenters`, T.office, { user_id: U.office })).status, 403);

  // The technical creator adds the office manager and a viewer.
  assert.equal((await call('POST', `/work/${w.id}/commenters`, T.tech, { user_id: U.office })).status, 201);
  assert.equal((await call('POST', `/work/${w.id}/commenters`, T.tech, { user_id: U.clerk })).status, 201);
  view = (await call('GET', `/work/${w.id}`, T.office)).body;
  assert.equal(view.can_comment, true);
  assert.deepEqual(view.commenters.map((c) => c.full_name).sort(), ['clerk', 'office']);

  // They can comment, but not change the status or edit the work.
  assert.equal((await call('POST', `/work/${w.id}/updates`, T.office, { body: 'When will it be done?' })).status, 201);
  assert.equal((await call('POST', `/work/${w.id}/updates`, T.clerk, { body: 'Customer asked too' })).status, 201);
  assert.equal((await call('POST', `/work/${w.id}/updates`, T.office, { body: 'done', status: 'completed' })).status, 403);
  assert.equal((await call('PATCH', `/work/${w.id}`, T.office, { title: 'changed' })).status, 403);

  // Technical staff carry on as before; removing someone ends their access.
  assert.equal((await call('POST', `/work/${w.id}/updates`, T.tech2, { body: 'Radiator arrives Thursday' })).status, 201);
  assert.equal((await call('DELETE', `/work/${w.id}/commenters/${U.office}`, T.tech)).status, 200);
  assert.equal((await call('POST', `/work/${w.id}/updates`, T.office, { body: 'again?' })).status, 403);
  assert.equal((await db.query('select count(*)::int n from work_updates where work_id = $1', [w.id])).rows[0].n, 3);
});

test('projects: the creator decides who can view and who can edit', async () => {
  const p = (await call('POST', '/projects', T.office, {
    service: 'water', island_id: maafushi.id, title: 'Water tariff study', budget: 50000,
    members: [{ user_id: U.tech, access: 'view' }],
  })).body;
  assert.equal(p.visibility, 'members');

  // Not shared with tech2: invisible to them, in the list, the detail and the overview.
  assert.ok(!(await call('GET', '/projects', T.tech2)).body.items.some((x) => x.id === p.id));
  assert.equal((await call('GET', `/projects/${p.id}`, T.tech2)).status, 404);
  assert.ok(!(await call('GET', '/dashboard', T.tech2)).body.projects.list.some((x) => x.id === p.id));

  // tech can view only.
  const seen = (await call('GET', `/projects/${p.id}`, T.tech)).body;
  assert.equal(seen.can_edit, false);
  assert.equal((await call('PATCH', `/projects/${p.id}`, T.tech, { progress_pct: 10 })).status, 403);
  assert.equal((await call('POST', `/projects/${p.id}/updates`, T.tech, { body: 'hi' })).status, 403);

  // The creator gives tech edit access: tech can edit but not change who has access.
  assert.equal((await call('PATCH', `/projects/${p.id}`, T.office, { members: [{ user_id: U.tech, access: 'edit' }] })).status, 200);
  assert.equal((await call('POST', `/projects/${p.id}/updates`, T.tech, { body: 'Survey done', progress_pct: 30 })).status, 201);
  assert.equal((await call('PATCH', `/projects/${p.id}`, T.tech, { members: [] })).status, 403);
  assert.equal((await call('PATCH', `/projects/${p.id}`, T.tech, { visibility: 'everyone' })).status, 403);

  // Administrators see and edit everything.
  assert.equal((await call('GET', `/projects/${p.id}`, T.admin)).body.can_manage, true);

  // Shared with everyone: all can view, still only members edit.
  assert.equal((await call('PATCH', `/projects/${p.id}`, T.office, { visibility: 'everyone' })).status, 200);
  assert.equal((await call('GET', `/projects/${p.id}`, T.clerk)).status, 200);
  assert.equal((await call('PATCH', `/projects/${p.id}`, T.tech2, { progress_pct: 90 })).status, 403);
  assert.equal((await call('GET', `/projects/${p.id}`, T.tech)).body.progress_pct, 30);
});

test('the audit trail hides technical changes from non-technical staff, and private projects from others', async () => {
  const office = (await call('GET', '/audit?limit=500', T.office)).body.items;
  assert.ok(!office.some((l) => ['assets', 'asset_status_log', 'engine_conditions', 'facilities'].includes(l.entity)));
  assert.ok(office.some((l) => l.entity === 'work_orders'));
  const p = (await call('POST', '/projects', T.office, { service: 'water', island_id: maafushi.id, title: 'Private plan' })).body;
  const mine = (await call('GET', '/audit?entity=projects&limit=500', T.office)).body.items;
  const theirs = (await call('GET', '/audit?entity=projects&limit=500', T.tech2)).body.items;
  assert.ok(mine.some((l) => l.entity_id === String(p.id)));
  assert.ok(!theirs.some((l) => l.entity_id === String(p.id)));
  assert.ok((await call('GET', '/audit?entity=projects&limit=500', T.admin)).body.items.some((l) => l.entity_id === String(p.id)));
});
