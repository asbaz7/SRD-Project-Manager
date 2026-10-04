// Telegram bot: linking, reporting from Telegram, alerts. Telegram's API is
// replaced by a stub that records what would have been sent.
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { buildApp } from '../src/app.js';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';
import { webhookSecret } from '../src/telegram.js';
import { seedRegister } from '../scripts/seed.js';

const PASSWORD = 'correct horse 42';
const TOKEN = '123456:test-token';
const ADMIN_TG = 1001;
const MANAGER_TG = 2002;
const STRANGER_TG = 3003;
const GROUP = -100500;

let app, db, admin, manager, maafushi;
let sent = [];
const realFetch = globalThis.fetch;

async function call(method, url, { token, body, headers = {} } = {}) {
  const res = await app.inject({
    method, url: `/api/v1${url}`,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body !== undefined ? { payload: body } : {}),
  });
  let json;
  try { json = res.json(); } catch { json = undefined; }
  return { status: res.statusCode, body: json };
}

const login = async (email) => (await call('POST', '/auth/login', { body: { email, password: PASSWORD } })).body.token;

let messageId = 1;
// Deliver a message to the bot the way Telegram would.
async function say(fromId, text, chat = { id: fromId, type: 'private', first_name: 'Test' }) {
  sent = [];
  const res = await call('POST', '/telegram/webhook', {
    headers: { 'x-telegram-bot-api-secret-token': webhookSecret(TOKEN) },
    body: { update_id: messageId, message: { message_id: messageId++, from: { id: fromId, is_bot: false, first_name: 'Test', username: `user${fromId}` }, chat, text } },
  });
  assert.equal(res.status, 200);
  return sent;
}
const repliesTo = (chatId) => sent.filter((m) => m.chat_id === chatId).map((m) => m.text).join('\n---\n');

before(async () => {
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://api.telegram.org/')) return realFetch(url, init);
    const method = String(url).split('/').pop();
    const body = init?.body ? JSON.parse(init.body) : {};
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 1, is_bot: true, username: 'srd_test_bot' } });
    if (method === 'sendMessage') sent.push(body);
    return Response.json({ ok: true, result: {} });
  };
  db = await createDb({ pgliteDir: ':memory:' });
  await migrate(db, {});
  await seedRegister(db);
  app = await buildApp({
    db, logger: false,
    config: loadConfig({ timezone: 'Indian/Maldives', webDist: '', telegramToken: TOKEN, publicUrl: 'https://srd.example' }),
  });
  const hash = await hashPassword(PASSWORD);
  await db.query(`insert into users (email, full_name, role, password_hash, must_change_password) values
    ('admin@srd.mv', 'Admin', 'admin', $1, false), ('mgr@srd.mv', 'Maafushi Manager', 'manager', $1, false)`, [hash]);
  admin = await login('admin@srd.mv');
  maafushi = (await call('GET', '/islands', { token: admin })).body.find((i) => i.name === 'Maafushi');
  await db.query(`insert into user_scopes (user_id, island_id) select id, $1 from users where email = 'mgr@srd.mv'`, [maafushi.id]);
  manager = await login('mgr@srd.mv');
});

after(async () => {
  globalThis.fetch = realFetch;
  await app?.close();
  await db?.close();
});

beforeEach(() => { sent = []; });

test('the webhook refuses requests without the secret', async () => {
  const res = await call('POST', '/telegram/webhook', { body: { message: { text: '/help' } } });
  assert.equal(res.status, 403);
  const wrong = await call('POST', '/telegram/webhook', { headers: { 'x-telegram-bot-api-secret-token': 'nope' }, body: {} });
  assert.equal(wrong.status, 403);
});

test('unknown Telegram users are told to link their account and can do nothing', async () => {
  await say(STRANGER_TG, '/down Maafushi 3 broken');
  assert.match(repliesTo(STRANGER_TG), /Link your account first/);
  const asset = (await db.query(`select s.status from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '3'`, [maafushi.id])).rows[0];
  assert.notEqual(asset.status, 'down');
});

test('a manager links Telegram with a one-time code from their account page', async () => {
  const code = (await call('POST', '/telegram/link-code', { token: manager })).body;
  assert.match(code.code, /^[A-Z2-9]{8}$/);
  assert.equal(code.url, `https://t.me/srd_test_bot?start=${code.code}`);

  // Not in a group, where others would see it.
  await say(MANAGER_TG, `/start ${code.code}`, { id: GROUP, type: 'supergroup', title: 'SRD' });
  assert.match(repliesTo(GROUP), /private chat/);

  await say(MANAGER_TG, `/start ${code.code}`);
  assert.match(repliesTo(MANAGER_TG), /Linked to <b>Maafushi Manager<\/b>/);
  const me = (await call('GET', '/telegram', { token: manager })).body;
  assert.equal(me.linked, true);
  assert.equal(me.telegram_name, `@user${MANAGER_TG}`);

  // Codes are single-use.
  await say(STRANGER_TG, `/start ${code.code}`);
  assert.match(repliesTo(STRANGER_TG), /wrong or has expired/);

  const adminCode = (await call('POST', '/telegram/link-code', { token: admin })).body.code;
  await say(ADMIN_TG, `/start ${adminCode}`);
});

test('/down sets an asset down as the linked user, and /up brings it back', async () => {
  await say(MANAGER_TG, '/down K. Maafushi G3 radiator leak');
  assert.match(repliesTo(MANAGER_TG), /Genset 3 is now <b>down<\/b>: radiator leak/);
  const { rows } = await db.query(
    `select s.status, s.status_note, l.reported_by, u.email from assets s join facilities f on f.id = s.facility_id
       join asset_status_log l on l.asset_id = s.id join users u on u.id = l.reported_by
      where f.island_id = $1 and s.tag = '3' order by l.reported_at desc limit 1`, [maafushi.id]);
  assert.equal(rows[0].status, 'down');
  assert.equal(rows[0].status_note, 'radiator leak');
  assert.equal(rows[0].email, 'mgr@srd.mv');

  await say(MANAGER_TG, '/up maafushi genset 3');
  assert.match(repliesTo(MANAGER_TG), /is now <b>running<\/b>/);
  // The bot's temporary sessions are cleaned up.
  assert.equal((await db.query(`select count(*)::int n from sessions where user_agent = 'telegram bot'`)).rows[0].n, 0);
});

test('a manager cannot report for islands outside their scope', async () => {
  await say(MANAGER_TG, '/down Guraidhoo 1 broken');
  assert.match(repliesTo(MANAGER_TG), /only change records for islands assigned to you/);
});

test('unclear islands and assets get a helpful answer', async () => {
  await say(MANAGER_TG, '/down Maafushi 99 broken');
  assert.match(repliesTo(MANAGER_TG), /Which one\? Maafushi has: Genset 1/);
  await say(MANAGER_TG, '/status Xyzzyville');
  assert.match(repliesTo(MANAGER_TG), /couldn't find that island/);
  await say(MANAGER_TG, '/down Maafushi 3');
  assert.match(repliesTo(MANAGER_TG), /Say what's wrong/);
});

test('/status shows an island', async () => {
  await say(MANAGER_TG, '/status Maafushi');
  const text = repliesTo(MANAGER_TG);
  assert.match(text, /<b>K\. Maafushi<\/b>/);
  assert.match(text, /Genset 1: /);
  assert.match(text, /https:\/\/srd\.example\/islands\//);
});

test('alerts go to chats that turned them on; serious incidents from Telegram alert the group', async () => {
  await say(ADMIN_TG, '/alerts on', { id: GROUP, type: 'supergroup', title: 'SRD Managers' });
  assert.match(repliesTo(GROUP), /Alerts are on/);

  await say(MANAGER_TG, '/incident Maafushi high power cut to the harbour area');
  assert.match(repliesTo(MANAGER_TG), /Reported <b>INC-\d+<\/b>/);
  assert.match(repliesTo(GROUP), /🚨 <b>High: power cut to the harbour area<\/b>/);
  const inc = (await db.query(`select service, severity, category from incidents order by id desc limit 1`)).rows[0];
  assert.deepEqual(inc, { service: 'electricity', severity: 'high', category: 'outage' });

  // A genset going down alerts the group too.
  await say(MANAGER_TG, '/down Maafushi 2 overheating');
  assert.match(repliesTo(GROUP), /🔴 <b>K\. Maafushi Genset 2 is down<\/b>: overheating/);

  // Medium incidents don't.
  await say(MANAGER_TG, '/incident Maafushi water RO membrane fouling');
  assert.equal(repliesTo(GROUP), '');
  assert.equal((await db.query(`select service from incidents order by id desc limit 1`)).rows[0].service, 'water');
});

test('/update and /done post work updates; completion alerts the group', async () => {
  const work = (await call('POST', '/work', { token: manager, body: { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Replace radiator' } })).body;
  const ref = `WO-${work.id}`;
  await say(MANAGER_TG, `/update ${ref} parts radiator ordered from Male`);
  assert.match(repliesTo(MANAGER_TG), /Status: <b>Awaiting parts<\/b>/);
  assert.equal((await db.query('select status from work_orders where id = $1', [work.id])).rows[0].status, 'awaiting_parts');

  await say(MANAGER_TG, `/done ${ref} fitted and tested`);
  assert.equal((await db.query('select status from work_orders where id = $1', [work.id])).rows[0].status, 'completed');
  assert.match(repliesTo(GROUP), /✅ <b>Work completed: Replace radiator<\/b>/);

  await say(MANAGER_TG, '/update WO-99999 hello');
  assert.match(repliesTo(MANAGER_TG), /no work order WO-99999/);
});

test('the daily summary goes to alert chats', async () => {
  await app.daily();
  const text = repliesTo(GROUP);
  assert.match(text, /📋 <b>SRD summary/);
  assert.match(text, /gensets running/);
  assert.match(text, /Serious incidents/);
  assert.match(text, /and \d+ more/);
});

test('administrators see the bot settings and alert chats; others do not', async () => {
  const a = (await call('GET', '/telegram', { token: admin })).body;
  assert.equal(a.bot, 'srd_test_bot');
  assert.equal(a.chats.length, 1);
  assert.equal(a.chats[0].title, 'SRD Managers');
  const m = (await call('GET', '/telegram', { token: manager })).body;
  assert.equal(m.chats, undefined);
  assert.equal((await call('POST', '/telegram/connect', { token: manager })).status, 403);
  const off = await call('PATCH', `/telegram/chats/${GROUP}`, { token: admin, body: { alerts: false } });
  assert.equal(off.status, 200);
});

test('/unlink disconnects the account', async () => {
  await say(MANAGER_TG, '/unlink');
  await say(MANAGER_TG, '/status Maafushi');
  assert.match(repliesTo(MANAGER_TG), /Link your account first/);
});
