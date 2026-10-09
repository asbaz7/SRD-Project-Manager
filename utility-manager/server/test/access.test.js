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

test('staff: permissions chosen per user', async () => {
  // One staff member allowed to send documents and report incidents; one with nothing extra.
  const mk = async (email, permissions, technical = false) => {
    const res = await call('POST', '/users', T.admin, { email, full_name: email, role: 'staff', technical, permissions, password: 'temporary1234' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.deepEqual(res.body.permissions.sort(), [...permissions].sort());
    await db.query('update users set must_change_password = false where id = $1', [res.body.id]);
    return { id: res.body.id, token: (await call('POST', '/auth/login', null, { email, password: 'temporary1234' })).body.token };
  };
  const clerk = await mk('docs@srd.mv', ['documents', 'incidents']);
  const plain = await mk('plain@srd.mv', []);
  const fitter = await mk('fitter@srd.mv', ['work'], true);
  assert.deepEqual((await call('GET', '/auth/me', clerk.token)).body.permissions.sort(), ['documents', 'incidents']);

  // Documents
  const doc = { ref: 'S-1', doc_type: 'Letter', sent_on: '2026-10-01', signers: [{ name: 'Someone' }] };
  assert.equal((await call('POST', '/documents', clerk.token, doc)).status, 201);
  assert.equal((await call('POST', '/documents', plain.token, { ...doc, ref: 'S-2' })).status, 403);

  // Incidents: report, and edit only their own
  const inc = { service: 'electricity', island_id: maafushi.id, category: 'outage', severity: 'low', title: 'Street light feeder trip', started_at: new Date().toISOString() };
  const mine = await call('POST', '/incidents', clerk.token, inc);
  assert.equal(mine.status, 201);
  assert.equal((await call('POST', '/incidents', plain.token, inc)).status, 403);
  assert.equal((await call('PATCH', `/incidents/${mine.body.id}`, clerk.token, { severity: 'medium' })).status, 200);
  const theirs = (await call('POST', '/incidents', T.tech, inc)).body;
  assert.equal((await call('GET', `/incidents/${theirs.id}`, clerk.token)).body.can_edit, false);
  assert.equal((await call('PATCH', `/incidents/${theirs.id}`, clerk.token, { severity: 'high' })).status, 403);

  // Projects: not allowed for these two
  assert.equal((await call('POST', '/projects', clerk.token, { service: 'water', title: 'x', island_id: maafushi.id })).status, 403);

  // Work: the fitter can post updates and move it along, not create, complete or cancel it
  const w = (await call('POST', '/work', T.tech, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Replace AVR' })).body;
  assert.equal((await call('POST', '/work', fitter.token, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'x' })).status, 403);
  assert.equal((await call('GET', `/work/${w.id}`, fitter.token)).body.can_update, true);
  assert.equal((await call('POST', `/work/${w.id}/updates`, fitter.token, { body: 'AVR on order', status: 'awaiting_parts' })).status, 201);
  assert.equal((await call('POST', `/work/${w.id}/updates`, fitter.token, { body: 'done', status: 'completed' })).status, 403);
  assert.equal((await call('PATCH', `/work/${w.id}`, fitter.token, { title: 'changed' })).status, 403);
  assert.equal((await call('POST', `/work/${w.id}/updates`, plain.token, { body: 'hi' })).status, 403);

  // Changing a manager to staff keeps only what's ticked; other roles have none.
  const promoted = await call('PATCH', `/users/${fitter.id}`, T.admin, { role: 'manager' });
  assert.deepEqual(promoted.body.permissions, []);
  assert.equal((await call('PATCH', `/users/${plain.id}`, T.admin, { permissions: ['bogus'] })).status, 400);
});

test('project files: kept while open, downloadable after, deleted 30 days after closing', async () => {
  const { unzipSync, strFromU8 } = await import('fflate');
  const p = (await call('POST', '/projects', T.tech, { service: 'water', island_id: maafushi.id, title: 'RO plant upgrade',
    visibility: 'members', members: [{ user_id: U.clerk, access: 'view' }] })).body;
  const add = (token, name, text) => call('POST', `/projects/${p.id}/files`, token, { file_name: name, content_type: 'application/pdf', data: Buffer.from(text).toString('base64') });
  assert.equal((await add(T.tech, 'BOQ.pdf', 'boq')).status, 201);
  assert.equal((await add(T.tech, 'BOQ.pdf', 'boq v2')).status, 201);
  assert.equal((await add(T.clerk, 'x.pdf', 'x')).status, 403, 'viewers of the project cannot add');
  assert.equal((await add(T.tech2, 'x.pdf', 'x')).status, 404, 'not shared with tech2');

  let d = (await call('GET', `/projects/${p.id}`, T.clerk)).body;
  assert.equal(d.files.length, 2);
  assert.equal(d.files_delete_after, null);
  const one = await app.inject({ method: 'GET', url: `/api/v1/projects/${p.id}/files/${d.files[0].id}`, headers: { authorization: `Bearer ${T.clerk}` } });
  assert.equal(one.body, 'boq');

  // Completed: no new files; the countdown starts; everything downloads as a ZIP.
  await call('POST', `/projects/${p.id}/updates`, T.tech, { body: 'Handed over', status: 'completed' });
  d = (await call('GET', `/projects/${p.id}`, T.tech)).body;
  const in30 = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Indian/Maldives' });
  assert.ok([in30, new Date(Date.now() + 29 * 86400000).toISOString().slice(0, 10), new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)].includes(String(d.files_delete_after).slice(0, 10)), String(d.files_delete_after));
  assert.equal((await add(T.tech, 'late.pdf', 'late')).status, 400);
  const zipRes = await fetchZip(p.id);
  const files = unzipSync(zipRes);
  assert.deepEqual(Object.keys(files).sort(), ['BOQ (2).pdf', 'BOQ.pdf']);
  assert.equal(strFromU8(files['BOQ (2).pdf']), 'boq v2');

  // Reopening cancels the countdown; closing again restarts it.
  await call('PATCH', `/projects/${p.id}`, T.tech, { status: 'ongoing' });
  assert.equal((await call('GET', `/projects/${p.id}`, T.tech)).body.files_delete_after, null);
  await call('PATCH', `/projects/${p.id}`, T.tech, { status: 'completed' });

  // The daily job deletes them once the date has passed; the project stays.
  await db.query(`update projects set files_delete_after = current_date - 1 where id = $1`, [p.id]);
  await app.daily();
  d = (await call('GET', `/projects/${p.id}`, T.tech)).body;
  assert.equal(d.files.length, 0);
  assert.equal(d.title, 'RO plant upgrade');
  assert.ok(d.updates.length > 0);

  async function fetchZip(id) {
    const r = await app.inject({ method: 'GET', url: `/api/v1/projects/${id}/zip`, headers: { authorization: `Bearer ${T.clerk}` } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['content-type'], 'application/zip');
    const res = await app.fetch(new Request(`http://x/api/v1/projects/${id}/zip`, { headers: { authorization: `Bearer ${T.clerk}` } }));
    return new Uint8Array(await res.arrayBuffer());
  }
});

test('deleting a closed project\'s files at once', async () => {
  const p = (await call('POST', '/projects', T.tech, { service: 'water', island_id: maafushi.id, title: 'Short job' })).body;
  await call('POST', `/projects/${p.id}/files`, T.tech, { file_name: 'a.pdf', data: Buffer.from('a').toString('base64') });
  await call('PATCH', `/projects/${p.id}`, T.tech, { status: 'completed' });
  assert.equal((await call('DELETE', `/projects/${p.id}/files`, T.tech2)).status, 404);
  const res = await call('DELETE', `/projects/${p.id}/files`, T.tech);
  assert.equal(res.body.deleted, 1);
});

test('projects: type, task breakdown and progress calculated from the tasks', async () => {
  const p = await call('POST', '/projects', T.tech, {
    title: 'ADh. Dhidhdhoo PH Upgrade', island_id: maafushi.id, project_type: 'infrastructure', status: 'ongoing',
    description: 'Upgrade and expansion of the existing powerhouse engine room',
    tasks: ['Planning & Design', 'Material Purchase and Logistics', 'Site Preparation', 'Demolition Works', 'Foundation Works',
      'Genset Bed Construction', 'Engine Room Extension', 'Air Chamber Modification', 'Roof Height & Structural Works',
      'Roofing Works', 'Access & Door Works', 'Control Room Modification', 'Workshop Construction', 'Inspection & Completion']
      .map((name, i) => ({ name, progress: i === 0 ? 100 : i === 1 ? 20 : 0 })),
  });
  assert.equal(p.status, 201, JSON.stringify(p.body));
  let d = (await call('GET', `/projects/${p.body.id}`, T.tech)).body;
  assert.equal(d.project_type, 'infrastructure');
  assert.equal(d.service, null, 'service is optional now');
  assert.equal(d.tasks.length, 14);
  assert.equal(d.progress_pct, 8.6);    // (100 + 20) / 14

  // Editing tasks recalculates; a manual progress value is ignored while there are tasks.
  const tasks = d.tasks.map((t) => ({ name: t.name, progress: t.position <= 3 ? 100 : t.progress }));
  tasks.push({ name: 'Handover', progress: 0 });
  assert.equal((await call('PATCH', `/projects/${p.body.id}`, T.tech, { tasks, progress_pct: 99 })).status, 200);
  d = (await call('GET', `/projects/${p.body.id}`, T.tech)).body;
  assert.equal(d.tasks.length, 15);
  assert.equal(d.progress_pct, 20);     // 300 / 15
  assert.equal((await call('POST', `/projects/${p.body.id}/updates`, T.tech, { body: 'x', progress_pct: 50 })).status, 400);
  assert.equal((await call('POST', `/projects/${p.body.id}/updates`, T.tech, { body: 'Foundation started', status: 'ongoing' })).status, 201);

  // Filter by type; unknown types are refused.
  assert.ok((await call('GET', '/projects?type=infrastructure', T.tech)).body.items.some((x) => x.id === p.body.id));
  assert.ok(!(await call('GET', '/projects?type=store', T.tech)).body.items.some((x) => x.id === p.body.id));
  assert.equal((await call('POST', '/projects', T.tech, { title: 'x', island_id: maafushi.id, project_type: 'powerhouse' })).status, 400);
});

test('access tokens: a service account for another system, revocable, changes signed with its name', async () => {
  const svc = await call('POST', '/admin/service-accounts', T.admin, { full_name: 'Fleet Manager', email: 'fleet-manager@srd.mv' });
  assert.equal(svc.status, 201, JSON.stringify(svc.body));
  assert.equal(svc.body.service_account, true);
  assert.equal((await call('POST', '/admin/service-accounts', T.tech, { full_name: 'x', email: 'x@srd.mv' })).status, 403);
  // Not listed among people; can't sign in with a password.
  assert.ok(!(await call('GET', '/users/directory', T.tech)).body.some((u) => u.id === svc.body.id));

  const made = await call('POST', '/admin/api-tokens', T.admin, { user_id: svc.body.id, name: 'Fleet Manager connector' });
  assert.equal(made.status, 201);
  const token = made.body.token;
  assert.match(token, /^srd_[A-Za-z0-9_-]{40,}$/);
  const list = (await call('GET', '/admin/api-tokens', T.admin)).body;
  assert.equal(list[0].token_hint, token.slice(-4));
  assert.ok(!JSON.stringify(list).includes(token), 'the token itself is never shown again');

  // It works like a technical manager, and its changes are signed with its name.
  assert.equal((await call('GET', '/auth/me', token)).body.fullName, 'Fleet Manager');
  assert.equal((await call('GET', '/engines', token)).status, 200);
  const g = (await call('GET', '/engines', token)).body.engines[0];
  assert.equal((await call('POST', `/assets/${g.id}/maintenance`, token, { kind: 'alternator_service', done_on: '2026-09-01', notes: 'From the Fleet Manager' })).status, 201);
  const who = (await db.query(`select u.full_name from audit_log l join users u on u.id = l.user_id where l.entity = 'maintenance_events' order by l.at desc limit 1`)).rows[0];
  assert.equal(who.full_name, 'Fleet Manager');

  // Revoked: refused at once.
  await call('DELETE', `/admin/api-tokens/${made.body.id}`, T.admin);
  assert.equal((await call('GET', '/auth/me', token)).status, 401);
  assert.equal((await call('GET', '/engines', 'srd_not-a-real-token-at-all-0000000000000000000')).status, 401);
});
