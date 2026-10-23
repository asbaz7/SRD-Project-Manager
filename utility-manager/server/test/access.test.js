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

test('work: non-technical staff see their unit\'s, technical staff run it, chosen people can comment', async () => {
  // Only technical staff start work.
  assert.equal((await call('POST', '/work', T.office, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'x' })).status, 403);
  const w = (await call('POST', '/work', T.tech, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Replace radiator' })).body;

  // Technical staff see all work; non-technical staff only their unit's,
  // and work they are added to.
  assert.ok((await call('GET', '/work', T.tech2)).body.items.some((x) => x.id === w.id));
  assert.ok(!(await call('GET', '/work', T.clerk)).body.items.some((x) => x.id === w.id));
  // Managers (office is one) also see all ongoing work.
  assert.equal((await call('GET', `/work/${w.id}`, T.office)).status, 200);
  assert.ok((await call('GET', '/dashboard', T.office)).body.work.some((x) => x.id === w.id));
  await db.query("update users set role = 'staff' where id = $1", [U.office]);
  assert.equal((await call('GET', `/work/${w.id}`, T.office)).status, 404);
  assert.ok(!(await call('GET', '/dashboard', T.office)).body.work.some((x) => x.id === w.id));
  await db.query("update users set role = 'manager' where id = $1", [U.office]);
  await db.query("update work_orders set status = 'completed' where id = $1", [w.id]);
  assert.equal((await call('GET', `/work/${w.id}`, T.office)).status, 404, 'finished work: back to their unit only');
  await db.query("update work_orders set status = 'planned' where id = $1", [w.id]);
  const admin = "(select id from units where name = 'Administration and Support Service Unit')";
  await db.query(`update users set unit_id = ${admin} where id = $1`, [U.office]);
  await db.query(`update work_orders set unit_id = ${admin} where id = $1`, [w.id]);
  assert.ok((await call('GET', '/dashboard', T.office)).body.work.some((x) => x.id === w.id));
  let view = (await call('GET', `/work/${w.id}`, T.office)).body;
  assert.equal(view.can_run, false);
  assert.equal(view.can_comment, false);

  // Not added yet: no comments, and non-technical staff can't add themselves.
  assert.equal((await call('POST', `/work/${w.id}/updates`, T.office, { body: 'When will it be done?' })).status, 403);
  assert.equal((await call('POST', `/work/${w.id}/commenters`, T.office, { user_id: U.office })).status, 403);

  // The technical creator adds the office manager and a viewer.
  assert.equal((await call('POST', `/work/${w.id}/commenters`, T.tech, { user_id: U.office })).status, 201);
  assert.equal((await call('POST', `/work/${w.id}/commenters`, T.tech, { user_id: U.clerk })).status, 201);
  assert.ok((await call('GET', '/work', T.clerk)).body.items.some((x) => x.id === w.id), 'added: now in their list');
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

test('surveys: templates, answers kept to the template, technical types hidden from non-technical staff', async () => {
  const types = (await call('GET', '/survey-templates', T.tech)).body;
  assert.deepEqual(types.map((t) => t.key), ['island_assessment', 'general']);
  assert.deepEqual((await call('GET', '/survey-templates', T.office)).body.map((t) => t.key), ['general']);

  // A powerhouse takeover survey for a place not in the register.
  const res = await call('POST', '/surveys', T.tech, {
    template: 'island_assessment', location_name: 'Dh. Bandidhoo', surveyed_on: '2026-10-08',
    answers: {
      powerhouse: { name: 'Dh. Bandidhoo', installed_kw: '1356', bogus: 'x' },
      gensets: [
        { engine_brand: 'Cummins', engine_model: 'NT-855-G4', engine_serial: '23219921', genset_kw: 160, condition: 'Running; OK', connected: 'yes' },
        { engine_brand: 'Cummins', engine_model: 'QSG12-G1', engine_serial: '76669969', genset_kw: '356', condition: 'Sort of', last_overhaul: '2025-02-30x' },
        {}, {},
      ],
      nonsense: { a: 1 },
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const s = res.body;
  assert.equal(s.ref, `SRV-${String(s.id).padStart(4, '0')}`);
  assert.equal(s.title, 'Island Assessment - Dh. Bandidhoo');
  assert.equal(s.status, 'draft');
  assert.deepEqual(s.answers.powerhouse, { name: 'Dh. Bandidhoo', installed_kw: 1356 });
  assert.equal(s.answers.gensets.length, 2, 'trailing empty gensets dropped');
  assert.equal(s.answers.gensets[1].genset_kw, 356);
  assert.equal(s.answers.gensets[1].condition, undefined, 'unknown choice dropped');
  assert.equal(s.answers.gensets[1].last_overhaul, undefined, 'bad date dropped');
  assert.equal(s.answers.nonsense, undefined);

  // Non-technical staff can't see it; a general survey they can.
  assert.equal((await call('GET', `/surveys/${s.id}`, T.office)).status, 404);
  assert.ok(!(await call('GET', '/surveys', T.office)).body.items.some((x) => x.id === s.id));
  const g = await call('POST', '/surveys', T.office, { template: 'general', island_id: maafushi.id, answers: { survey: { purpose: 'Office space check' } } });
  assert.equal(g.status, 201);
  assert.equal(g.body.title, 'General site survey - K. Maafushi');
  assert.equal((await call('POST', '/surveys', T.office, { template: 'island_assessment', island_id: maafushi.id })).status, 400);

  // Editing and completing; others can view but not edit; viewers can't start one.
  assert.equal((await call('POST', '/surveys', T.clerk, { template: 'general', island_id: maafushi.id })).status, 403);
  const done = await call('PATCH', `/surveys/${s.id}`, T.tech, { status: 'completed', answers: { ...s.answers, summary: { findings: 'Gen 1 needs overhaul' } } });
  assert.equal(done.status, 200);
  assert.equal(done.body.status, 'completed');
  assert.ok(done.body.completed_at);
  assert.equal(done.body.answers.summary.findings, 'Gen 1 needs overhaul');
  assert.equal((await call('GET', `/surveys/${s.id}`, T.tech2)).body.can_edit, true, 'managers can edit');

  // CSV of the answers, and a photo (linked from OneDrive).
  const csv = await app.inject({ method: 'GET', url: `/api/v1/surveys/${s.id}/csv`, headers: { authorization: `Bearer ${T.tech}` } });
  assert.match(csv.body, /Genset details,Gen 2,Engine serial number,76669969/);
  const up = await call('POST', `/surveys/${s.id}/links`, T.tech, { url: 'https://stelco-my.sharepoint.com/personal/x/Documents/engine%20room.jpg' });
  assert.equal(up.status, 201);
  assert.equal(up.body.title, 'engine room.jpg');
  assert.equal((await call('GET', `/surveys/${s.id}`, T.tech)).body.links.length, 1);
  assert.equal((await call('GET', '/surveys', T.tech)).body.items.find((x) => x.id === s.id).file_count, 1);

  // Only admins (or the starter, while a draft) can delete.
  assert.equal((await call('DELETE', `/surveys/${s.id}`, T.tech)).status, 403, 'completed: starter cannot delete');
  assert.equal((await call('DELETE', `/surveys/${g.body.id}`, T.office)).status, 200, 'own draft');
});

test('access tokens: a service account for the Fleet Manager reads records and sends monthly updates, until revoked', async () => {
  const svc = await call('POST', '/admin/service-accounts', T.admin, { full_name: 'Fleet Manager', email: 'fleet-manager@srd.mv' });
  assert.equal(svc.status, 201, JSON.stringify(svc.body));
  assert.equal(svc.body.service_account, true);
  assert.equal((await call('POST', '/admin/service-accounts', T.tech, { full_name: 'x', email: 'x@srd.mv' })).status, 403);
  // Not listed among people; can't sign in with a password.
  assert.ok(!(await call('GET', '/users/directory', T.tech)).body.some((u) => u.id === svc.body.id));
  // Tokens are only for service accounts.
  assert.equal((await call('POST', '/admin/api-tokens', T.admin, { user_id: U.tech, name: 'x' })).status, 404);
  assert.equal((await call('POST', '/admin/api-tokens', T.tech, { user_id: svc.body.id, name: 'x' })).status, 403);

  // Switched off (as on 14 Oct 2026): a new token switches it back on.
  await db.query('update users set active = false where id = $1', [svc.body.id]);
  const made = await call('POST', '/admin/api-tokens', T.admin, { user_id: svc.body.id, name: 'Fleet Manager' });
  assert.equal(made.status, 201);
  const token = made.body.token;
  assert.match(token, /^srd_[A-Za-z0-9_-]{40,}$/);
  const list = (await call('GET', '/admin/api-tokens', T.admin)).body;
  assert.equal(list[0].token_hint, token.slice(-4));
  assert.ok(!JSON.stringify(list).includes(token), 'the token itself is never shown again');

  // It reads like a technical manager...
  assert.equal((await call('GET', '/auth/me', token)).body.fullName, 'Fleet Manager');
  const g = (await call('GET', '/engines', token)).body.engines.find((e) => e.island_name === 'Maafushi');
  const ph = (await call('GET', `/assets/${g.id}`, token)).body.facility_id;
  const form = await call('GET', `/facilities/${ph}/genset-update`, token);
  assert.equal(form.status, 200);
  // ...and sends the month's records, kept as from the Fleet Manager and signed with its name.
  const sent = await call('POST', `/facilities/${ph}/genset-update`, token, { items: [{ asset_id: g.id, total_hours: 50000, meter_replaced: true }] });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  const rec = (await db.query(`select r.source, u.full_name from engine_reports r join users u on u.id = r.received_by
    where r.asset_id = $1 order by r.received_at desc limit 1`, [g.id])).rows[0];
  assert.deepEqual(rec, { source: 'fleet_manager', full_name: 'Fleet Manager' });
  // The same from the website is the monthly update.
  await call('POST', `/facilities/${ph}/genset-update`, T.tech, { items: [{ asset_id: g.id, total_hours: 50010 }] });
  assert.equal((await db.query("select source from engine_conditions where asset_id = $1", [g.id])).rows[0].source, 'update');

  // Its "last used" stamps are hidden from the audit trail unless asked for.
  const stamps = (rows) => rows.filter((l) => l.entity === 'api_tokens' && l.action === 'update'
    && Object.keys(l.changes).length === 1 && l.changes.last_used_at);
  assert.equal(stamps((await call('GET', '/audit?limit=200', T.admin)).body.items).length, 0);

  // Revoked: refused at once; made-up tokens too.
  await call('DELETE', `/admin/api-tokens/${made.body.id}`, T.admin);
  assert.equal((await call('GET', '/auth/me', token)).status, 401);
  assert.equal((await call('GET', '/engines', 'srd_not-a-real-token-at-all-0000000000000000000')).status, 401);
});

test('project files are Microsoft 365 links: nothing is stored', async () => {
  const p = (await call('POST', '/projects', T.tech, { service: 'electricity', island_id: maafushi.id, title: 'New connections 2027',
    visibility: 'members', members: [{ user_id: U.clerk, access: 'view' }] })).body;
  // Uploading is gone.
  for (const url of [`/projects/${p.id}/files`, `/projects/${p.id}/files/1/versions`]) {
    assert.equal((await call('POST', url, T.tech, { file_name: 'x.xlsx', data: Buffer.from('x').toString('base64') })).status, 404, url);
  }
  const url = 'https://stelco.sharepoint.com/:x:/r/sites/SRD/Shared%20Documents/Power_House_New_Connections_2027.xlsx?d=w1&web=1';
  const link = await call('POST', `/projects/${p.id}/links`, T.tech, { url });
  assert.equal(link.status, 201, JSON.stringify(link.body));
  assert.equal(link.body.title, 'Power_House_New_Connections_2027.xlsx', 'titled from the file name in the address');
  assert.equal((await call('POST', `/projects/${p.id}/links`, T.tech, { url: 'https://1drv.ms/x/s!abc', title: 'Load list' })).body.title, 'Load list');
  assert.equal((await call('POST', `/projects/${p.id}/links`, T.tech, { url: 'http://example.com/x.xlsx' })).status, 400, 'https only');
  assert.equal((await call('POST', `/projects/${p.id}/links`, T.tech, { url: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('POST', `/projects/${p.id}/links`, T.clerk, { url })).status, 403, 'viewers cannot add');
  assert.equal((await call('POST', `/projects/${p.id}/links`, T.tech2, { url })).status, 404, 'not shared with them');
  const d = (await call('GET', `/projects/${p.id}`, T.clerk)).body;
  assert.deepEqual(d.links.map((l) => l.title), ['Power_House_New_Connections_2027.xlsx', 'Load list']);
  assert.equal(d.files, undefined);
  assert.equal((await call('DELETE', `/projects/${p.id}/links/${link.body.id}`, T.clerk)).status, 403);
  assert.equal((await call('DELETE', `/projects/${p.id}/links/${link.body.id}`, T.tech)).status, 200);
  assert.equal((await call('GET', `/projects/${p.id}`, T.tech)).body.links.length, 1);
  // Closing a project leaves its links alone.
  await call('PATCH', `/projects/${p.id}`, T.tech, { status: 'completed' });
  assert.equal((await call('GET', `/projects/${p.id}`, T.tech)).body.links.length, 1);
});

test('units: people belong to one; work and projects are assigned to one, and its members can view the project', async () => {
  const { rows: [mate] } = await db.query(`insert into users (email, full_name, role, technical, password_hash, must_change_password)
    values ('mate@srd.mv', 'mate', 'viewer', false, $1, false) returning id`, [await hashPassword(PASSWORD)]);
  U.mate = mate.id;
  T.mate = (await call('POST', '/auth/login', null, { email: 'mate@srd.mv', password: PASSWORD })).body.token;
  const units = (await call('GET', '/units', T.mate)).body;
  assert.deepEqual(units.map((u) => u.name), ['Mechanical Unit', 'Electrical Unit', 'General Maintenance Unit',
    'Administration and Support Service Unit', 'Logistics Unit', 'Water and Sewerage Unit']);
  const [mech, elec] = units;

  // An administrator sets a person's unit; the directory shows it.
  assert.equal((await call('PATCH', `/users/${U.tech}`, T.tech, { unit_id: mech.id })).status, 403);
  assert.equal((await call('PATCH', `/users/${U.tech}`, T.admin, { unit_id: mech.id })).body.unit_name, 'Mechanical Unit');
  assert.equal((await call('PATCH', `/users/${U.mate}`, T.admin, { unit_id: mech.id })).status, 200);
  assert.equal((await call('PATCH', `/users/${U.office}`, T.admin, { unit_id: elec.id })).status, 200);
  assert.equal((await call('GET', '/users/directory', T.mate)).body.find((u) => u.id === U.tech).unit_id, mech.id);
  assert.equal((await call('PATCH', `/users/${U.tech2}`, T.admin, { unit_id: 999 })).status, 409);

  // Work: assigned to a unit, filtered by unit or "my unit".
  const w = (await call('POST', '/work', T.tech, { island_id: maafushi.id, service: 'electricity', kind: 'service', title: 'Unit work', unit_id: mech.id })).body;
  assert.equal(w.unit_name, 'Mechanical Unit');
  assert.ok((await call('GET', `/work?unit=${mech.id}`, T.mate)).body.items.some((x) => x.id === w.id));
  assert.ok((await call('GET', '/work?unit=mine', T.tech)).body.items.some((x) => x.id === w.id));
  assert.ok(!(await call('GET', '/work?unit=mine', T.office)).body.items.some((x) => x.id === w.id));
  assert.equal((await call('PATCH', `/work/${w.id}`, T.tech, { unit_id: elec.id })).body.unit_name, 'Electrical Unit');

  // New work without a unit goes to its creator's, or else the assignee's.
  const mine = (await call('POST', '/work', T.tech, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'No unit given' })).body;
  assert.equal(mine.unit_name, 'Mechanical Unit');
  const byAdmin = (await call('POST', '/work', T.admin, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'For tech', assigned_user_id: U.tech })).body;
  assert.equal(byAdmin.unit_name, 'Mechanical Unit');
  const chosen = (await call('POST', '/work', T.tech, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Chosen', unit_id: elec.id })).body;
  assert.equal(chosen.unit_name, 'Electrical Unit');

  // Projects: members of its unit can view a private project, others can't;
  // only those who manage it can change the unit.
  const p = (await call('POST', '/projects', T.office, { service: 'water', island_id: maafushi.id, title: 'Unit project', unit_id: mech.id })).body;
  assert.equal(p.unit_name, 'Mechanical Unit');
  assert.equal((await call('GET', `/projects/${p.id}`, T.mate)).body.access, 'view');
  assert.equal((await call('PATCH', `/projects/${p.id}`, T.mate, { title: 'x' })).status, 403);
  assert.equal((await call('GET', `/projects/${p.id}`, T.tech2)).status, 404);
  assert.ok((await call('GET', '/projects?unit=mine', T.tech)).body.items.some((x) => x.id === p.id));
  assert.equal((await call('PATCH', `/projects/${p.id}`, T.office, { unit_id: elec.id })).body.unit_name, 'Electrical Unit');
  assert.equal((await call('GET', `/projects/${p.id}`, T.mate)).status, 404);
});

test('unit heads assign work in their unit and run it; the General Manager assigns anyone; others only themselves', async () => {
  const [mech, elec] = (await call('GET', '/units', T.tech)).body;
  // office (non-technical) heads Electrical; tech2 joins it; tech stays in Mechanical.
  await db.query('update units set head_user_id = $1 where id = $2', [U.office, elec.id]);
  await call('PATCH', `/users/${U.office}`, T.admin, { unit_id: elec.id });
  await call('PATCH', `/users/${U.tech2}`, T.admin, { unit_id: elec.id });
  const job = (token, extra) => call('POST', '/work', token, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Head test', ...extra });

  // Not a head: may take work, not hand it to others.
  assert.equal((await job(T.tech, { assigned_user_id: U.tech2 })).status, 403);
  const own = (await job(T.tech, { assigned_user_id: U.tech })).body;
  assert.equal(own.assigned_user_id, U.tech);
  assert.equal((await call('PATCH', `/work/${own.id}`, T.tech, { assigned_user_id: U.tech2 })).status, 403);
  // Saving other changes keeps the existing assignee without a check.
  assert.equal((await call('PATCH', `/work/${own.id}`, T.tech, { title: 'Head test, renamed', assigned_user_id: U.tech })).status, 200);

  // The (non-technical) head logs work for the unit, assigns its people, runs it.
  const w = await job(T.office, { assigned_user_id: U.tech2 });
  assert.equal(w.status, 201);
  assert.equal(w.body.unit_name, 'Electrical Unit');
  assert.equal((await job(T.office, { assigned_user_id: U.tech })).status, 403);
  assert.equal((await job(T.office, { unit_id: mech.id })).status, 403);
  assert.equal((await call('GET', `/work/${w.body.id}`, T.office)).body.can_run, true);
  assert.equal((await call('POST', `/work/${w.body.id}/updates`, T.office, { body: 'Done', status: 'completed' })).status, 201);
  assert.equal((await call('GET', '/auth/me', T.office)).body.headOf[0], elec.id);

  // The General Manager assigns anyone.
  await call('PATCH', `/users/${U.tech2}`, T.admin, { designation: 'General Manager', unit_id: null });
  assert.equal((await job(T.tech2, { assigned_user_id: U.tech })).status, 201);
});

test('water and sewerage plants keep their operating licence and handover date', async () => {
  const f = await call('POST', '/facilities', T.admin, { island_id: maafushi.id, service: 'sewerage', kind: 'sewerage_system', name: 'Maafushi Sewerage System',
    handover_on: '2019-07-19', licence_type: 'TP', licence_issued_on: '2022-07-07', licence_expires_on: '2023-07-07', licence_status: 'Expired' });
  assert.equal(f.status, 201);
  assert.equal(f.body.licence_type, 'TP');
  const p = await call('PATCH', `/facilities/${f.body.id}`, T.admin, { licence_type: 'T', licence_expires_on: '2027-06-14', licence_status: 'Valid' });
  assert.equal(p.body.licence_status, 'Valid');
  const water = (await call('GET', '/services/sewerage', T.admin)).body.facilities.find((x) => x.id === f.body.id);
  assert.equal(water.licence_type, 'T');
});

test('the author of an update can correct it for 8 hours; nobody else can', async () => {
  const w = (await call('POST', '/work', T.admin, { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Edit test' })).body;
  const u = (await call('POST', `/work/${w.id}/updates`, T.tech, { body: 'shutoff vlave replaced' })).body;
  let view = (await call('GET', `/work/${w.id}`, T.tech)).body.updates[0];
  assert.equal(view.can_edit, true);
  assert.equal((await call('GET', `/work/${w.id}`, T.admin)).body.updates[0].can_edit, false);

  assert.equal((await call('PATCH', `/work/${w.id}/updates/${u.id}`, T.admin, { body: 'changed by someone else' })).status, 403);
  const fixed = await call('PATCH', `/work/${w.id}/updates/${u.id}`, T.tech, { body: 'shutoff valve replaced' });
  assert.equal(fixed.status, 200);
  assert.equal(fixed.body.body, 'shutoff valve replaced');
  assert.ok(fixed.body.edited_at);

  // After 8 hours it can't be changed any more.
  await db.query("update work_updates set created_at = now() - interval '9 hours' where id = $1", [u.id]);
  assert.equal((await call('GET', `/work/${w.id}`, T.tech)).body.updates[0].can_edit, false);
  assert.equal((await call('PATCH', `/work/${w.id}/updates/${u.id}`, T.tech, { body: 'too late' })).status, 403);

  // Project updates the same way.
  const p = (await call('POST', '/projects', T.office, { service: 'water', island_id: maafushi.id, title: 'Edit test project' })).body;
  const pu = (await call('POST', `/projects/${p.id}/updates`, T.office, { body: 'Surveyd' })).body;
  assert.equal((await call('PATCH', `/projects/${p.id}/updates/${pu.id}`, T.office, { body: 'Surveyed' })).body.body, 'Surveyed');
  assert.equal((await call('PATCH', `/projects/${p.id}/updates/${pu.id}`, T.admin, { body: 'x' })).status, 403);
});
