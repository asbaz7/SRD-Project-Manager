// Documents sent for signature (replacing the "E-sign status" list).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const PASSWORD = 'correct horse 42';
let app, db;
const T = {};
const U = {};

async function call(method, url, token, body) {
  const res = await app.inject({
    method, url: `/api/v1${url}`,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(body !== undefined ? { payload: body } : {}),
  });
  let json;
  try { json = res.json(); } catch { json = undefined; }
  return { status: res.statusCode, body: json, raw: res };
}

before(async () => {
  db = await createDb({ pgliteDir: ':memory:' });
  await migrate(db, {});
  app = await buildApp({ db, config: loadConfig({ timezone: 'Indian/Maldives', webDist: '' }), logger: false });
  const hash = await hashPassword(PASSWORD);
  // Admin staff (non-technical), the approvers, and an engineer.
  for (const [name, role, technical] of [['admin', 'admin', true], ['nashmee', 'manager', false], ['yasir', 'manager', true],
    ['iqbal', 'viewer', false], ['eng', 'manager', true]]) {
    const { rows } = await db.query(`insert into users (email, full_name, role, technical, password_hash, must_change_password)
      values ($1, $2, $3, $4, $5, false) returning id`, [`${name}@srd.mv`, name, role, technical, hash]);
    U[name] = rows[0].id;
    T[name] = (await call('POST', '/auth/login', null, { email: `${name}@srd.mv`, password: PASSWORD })).body.token;
  }
});

after(async () => {
  await app?.close();
  await db?.close();
});

let tender;

test('a document is entered with its recipients in order; status follows the signatures', async () => {
  const res = await call('POST', '/documents', T.nashmee, {
    ref: 'RPT/2026/22', doc_type: 'Tender', sent_on: '2026-04-01',
    signers: [{ user_id: U.yasir }, { user_id: U.iqbal }, { name: 'Mohamed Saleem' }, { name: 'Dr. Ali Azwar' }],
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  tender = res.body;
  assert.equal(tender.status, 'pending');
  assert.equal(tender.sent_by, U.nashmee);
  assert.deepEqual(tender.signers.map((s) => s.name), ['yasir', 'iqbal', 'Mohamed Saleem', 'Dr. Ali Azwar']);

  // Agreement IDs are unique.
  assert.equal((await call('POST', '/documents', T.nashmee, { ref: 'rpt/2026/22', doc_type: 'Tender', sent_on: '2026-04-01', signers: [{ name: 'x' }] })).status, 409);

  // Yasir sees it waiting for him, and signs it himself.
  assert.ok((await call('GET', '/documents?view=waiting', T.yasir)).body.items.some((d) => d.id === tender.id));
  assert.equal((await call('GET', '/dashboard', T.yasir)).body.documents.waiting_for_me.length, 1);
  const doc = (await call('GET', `/documents/${tender.id}`, T.yasir)).body;
  assert.ok(doc.my_signer);
  assert.equal(doc.can_edit, false);
  assert.equal((await call('POST', `/documents/${tender.id}/signers/${doc.my_signer}/sign`, T.yasir, { signed_on: '2026-04-02' })).status, 200);
  assert.equal((await call('GET', '/documents?view=waiting', T.yasir)).body.items.length, 0);

  // He can't sign for anyone else.
  const others = doc.signers.filter((s) => s.id !== doc.my_signer);
  assert.equal((await call('POST', `/documents/${tender.id}/signers/${others[1].id}/sign`, T.yasir, {})).status, 403);

  // A viewer can sign their own; the sender records the two without logins.
  const iqbal = others.find((s) => s.user_id === U.iqbal);
  assert.equal((await call('POST', `/documents/${tender.id}/signers/${iqbal.id}/sign`, T.iqbal, { signed_on: '2026-04-05' })).status, 200);
  const saleem = others.find((s) => s.name === 'Mohamed Saleem');
  const azwar = others.find((s) => s.name === 'Dr. Ali Azwar');
  await call('POST', `/documents/${tender.id}/signers/${saleem.id}/sign`, T.nashmee, { signed_on: '2026-04-06' });
  const last = await call('POST', `/documents/${tender.id}/signers/${azwar.id}/sign`, T.nashmee, { signed_on: '2026-04-08' });
  assert.equal(last.body.status, 'completed');

  const done = (await call('GET', `/documents/${tender.id}`, T.eng)).body;
  assert.equal(done.status, 'completed');
  assert.equal(done.last_approval_on, '2026-04-08');
  assert.equal(done.signed_count, 4);

  // Undoing a signature (a correction) puts it back to pending.
  assert.equal((await call('POST', `/documents/${tender.id}/signers/${azwar.id}/sign`, T.nashmee, { undo: true })).body.status, 'pending');
});

test('editing: only the sender, whoever entered it, or an administrator; signatures kept for recipients who stay', async () => {
  assert.equal((await call('PATCH', `/documents/${tender.id}`, T.yasir, { doc_type: 'Letter' })).status, 403);
  const signer = (await call('GET', `/documents/${tender.id}`, T.admin)).body.signers;
  // Drop Dr. Ali Azwar: the three who signed stay signed, so it completes.
  const res = await call('PATCH', `/documents/${tender.id}`, T.nashmee, {
    signers: signer.filter((s) => s.name !== 'Dr. Ali Azwar').map((s) => (s.user_id ? { user_id: s.user_id } : { name: s.name })),
  });
  assert.equal(res.status, 200);
  const d = (await call('GET', `/documents/${tender.id}`, T.admin)).body;
  assert.equal(d.signers.length, 3);
  assert.ok(d.signers.every((s) => s.signed_on));
  assert.equal(d.status, 'completed');
  // Cancelling sticks, and nothing more can be signed.
  await call('PATCH', `/documents/${tender.id}`, T.admin, { status: 'cancelled' });
  assert.equal((await call('GET', `/documents/${tender.id}`, T.admin)).body.status, 'cancelled');
});

test('filters, search and CSV export like the old list', async () => {
  await call('POST', '/documents', T.nashmee, { ref: 'ADM/2026/001', doc_type: 'Accommodation form', sent_on: '2026-04-01',
    signers: [{ name: 'Aminath Jaleela' }, { name: 'Hassan Azim' }] });
  await call('POST', '/documents', T.nashmee, { ref: 'D-010-2026', doc_type: 'Allowance form', sent_by_name: 'Fathmath Zimna Zaheer', sent_on: '2026-03-31',
    signers: [{ name: 'Sameeha Musthafa' }] });
  const pending = (await call('GET', '/documents?status=pending', T.eng)).body.items;
  assert.deepEqual(pending.map((d) => d.ref).sort(), ['ADM/2026/001', 'D-010-2026']);
  assert.deepEqual((await call('GET', '/documents?type=Allowance%20form', T.eng)).body.items.map((d) => d.sent_by_label), ['Fathmath Zimna Zaheer']);
  assert.deepEqual((await call('GET', '/documents?q=Hassan', T.eng)).body.items.map((d) => d.ref), ['ADM/2026/001']);
  const types = (await call('GET', '/documents/types', T.eng)).body;
  assert.ok(types.includes('Meal form') && types.includes('Tender'));
  const csv = await call('GET', '/documents?format=csv', T.eng);
  assert.equal(csv.status, 200);
  assert.match(csv.raw.body, /Agreement ID,Document type/);
  assert.match(csv.raw.body, /Aminath Jaleela; Hassan Azim/);
});

test('files are attached and downloaded; notes are posted by the sender and recipients only', async () => {
  const pdf = Buffer.from('%PDF-1.4 test file');
  const up = await call('POST', `/documents/${tender.id}/files`, T.nashmee, { file_name: 'RPT-2026-22 signed.pdf', content_type: 'application/pdf', data: pdf.toString('base64') });
  assert.equal(up.status, 201);
  const down = await call('GET', `/documents/${tender.id}/files/${up.body.id}`, T.eng);
  assert.equal(down.status, 200);
  assert.equal(down.raw.headers['content-type'], 'application/pdf');
  assert.match(down.raw.headers['content-disposition'], /RPT-2026-22 signed\.pdf/);
  assert.equal(down.raw.body, pdf.toString());
  assert.equal((await call('POST', `/documents/${tender.id}/files`, T.eng, { file_name: 'x.pdf', data: pdf.toString('base64') })).status, 403);
  assert.equal((await call('POST', `/documents/${tender.id}/updates`, T.yasir, { body: 'Signed copy sent back' })).status, 201);
  assert.equal((await call('POST', `/documents/${tender.id}/updates`, T.eng, { body: 'hi' })).status, 403);
  assert.equal((await call('DELETE', `/documents/${tender.id}/files/${up.body.id}`, T.yasir)).status, 403);
  assert.equal((await call('DELETE', `/documents/${tender.id}/files/${up.body.id}`, T.nashmee)).status, 200);
});
