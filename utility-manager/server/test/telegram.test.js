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

// Claude's side of the conversation: each entry answers one request.
let claudeScript = [];
let claudeRequests = [];
const toolUse = (name, input) => ({ type: 'tool_use', id: `toolu_${name}_${claudeRequests.length}`, name, input });
const lastToolResults = (body) => body.messages.at(-1).content.filter((b) => b.type === 'tool_result');

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
// A tap on an inline button under one of the bot's messages.
async function tap(fromId, data, chatId = fromId) {
  sent = [];
  const res = await call('POST', '/telegram/webhook', {
    headers: { 'x-telegram-bot-api-secret-token': webhookSecret(TOKEN) },
    body: { update_id: messageId, callback_query: { id: `cb${messageId++}`, from: { id: fromId, is_bot: false, first_name: 'Test' },
      message: { message_id: 1, chat: { id: chatId, type: 'private' } }, data } },
  });
  assert.equal(res.status, 200);
  return sent;
}
const repliesTo = (chatId) => sent.filter((m) => m.chat_id === chatId).map((m) => m.text).join('\n---\n');

before(async () => {
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.anthropic.com/')) {
      const body = JSON.parse(init.body);
      claudeRequests.push(body);
      let content;
      try {
        content = claudeScript.shift()?.(body);
        assert.ok(content, 'unexpected request to Claude');
      } catch (err) {
        // A 400 is not retried, so the failure shows up as it happened.
        console.error('Claude stub:', err.message);
        return Response.json({ type: 'error', error: { type: 'invalid_request_error', message: err.message } }, { status: 400 });
      }
      const toolUse = content.some((b) => b.type === 'tool_use');
      return Response.json({ id: `msg_${claudeRequests.length}`, type: 'message', role: 'assistant', model: body.model, content,
        stop_reason: toolUse ? 'tool_use' : 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10 } });
    }
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
  // Every seeded powerhouse is surveyed and expected to report (as on the live system).
  await db.query("update facilities set reports_from = '2024-01-01' where kind = 'powerhouse'");
  app = await buildApp({
    db, logger: false,
    config: loadConfig({ timezone: 'Indian/Maldives', webDist: '', telegramToken: TOKEN, anthropicKey: 'test-key', publicUrl: 'https://srd.example' }),
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
  await say(MANAGER_TG, `/start ${code.code}`, { id: GROUP, type: 'supergroup', title: 'SCRD' });
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
  // What's wrong is logged as a major fault, and the work opened for it clears it.
  const g3 = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '3'`, [maafushi.id])).rows[0].id;
  const open = async () => (await db.query('select id, level, note from fault_log where asset_id = $1 and cleared_at is null order by id', [g3])).rows;
  let faults = await open();
  assert.deepEqual(faults.map((f) => [f.level, f.note]), [['major', 'radiator leak']]);
  const { rows: [wo] } = await db.query("select fault_id from work_orders where asset_id = $1 and status not in ('completed', 'cancelled') order by created_at desc limit 1", [g3]);
  assert.equal(String(wo.fault_id), String(faults[0].id));
  assert.equal((await db.query('select fault_level from assets where id = $1', [g3])).rows[0].fault_level, 'major');

  await say(MANAGER_TG, '/up maafushi genset 3');
  assert.match(repliesTo(MANAGER_TG), /is now <b>running<\/b>/);
  assert.equal((await open()).length, 0, 'back in service clears it');
  // "minor" first: a minor fault.
  await say(MANAGER_TG, '/down maafushi g3 minor oil leak');
  assert.match(repliesTo(MANAGER_TG), /down<\/b>: oil leak\n▲ minor fault logged/);
  faults = await open();
  assert.deepEqual(faults.map((f) => [f.level, f.note]), [['minor', 'oil leak']]);
  await say(MANAGER_TG, '/up maafushi g3');
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

test('/status takes the atoll by code or name: Th Omadhoo, Thaa Omadhoo, Th. Omadhoo', async () => {
  for (const [code, name] of [['ADh', 'Alif Dhaal'], ['Th', 'Thaa']]) {
    await db.query('insert into atolls (code, name) values ($1, $2) on conflict (code) do nothing', [code, name]);
    await db.query(`insert into islands (atoll_id, name) select id, 'Omadhoo' from atolls where code = $1
                    on conflict (atoll_id, name) do nothing`, [code]);
  }
  for (const text of ['/status Th Omadhoo', '/status Th. Omadhoo', '/status Thaa Omadhoo', '/status th omadhoo']) {
    await say(MANAGER_TG, text);
    assert.match(repliesTo(MANAGER_TG), /<b>Th\. Omadhoo<\/b>/, text);
  }
  await say(MANAGER_TG, '/status ADh Omadhoo');
  assert.match(repliesTo(MANAGER_TG), /<b>ADh\. Omadhoo<\/b>/);
  await say(MANAGER_TG, '/status Omadhoo');
  assert.match(repliesTo(MANAGER_TG), /^Which island\? ADh\. Omadhoo, Th\. Omadhoo$/);

  // The islands come as buttons: a tap gives that island's status.
  const buttons = sent.at(-1).reply_markup.inline_keyboard.flat();
  assert.deepEqual(buttons.map((b) => b.text), ['ADh. Omadhoo', 'Th. Omadhoo']);
  const tapped = await tap(MANAGER_TG, buttons[1].callback_data);
  assert.match(tapped.at(-1).text, /<b>Th\. Omadhoo<\/b>/);
  await say(MANAGER_TG, '/work Omadhoo');
  const workButton = sent.at(-1).reply_markup.inline_keyboard.flat()[0];
  assert.match((await tap(MANAGER_TG, workButton.callback_data)).at(-1).text, /ADh\. Omadhoo/);
});

test('a unit head hears on Telegram about new work for their unit', async () => {
  const [mech] = (await call('GET', '/units', { token: admin })).body;
  await db.query("update users set telegram_user_id = $1 where email = 'admin@srd.mv'", [ADMIN_TG]);
  await db.query("update units set head_user_id = (select id from users where email = 'admin@srd.mv') where id = $1", [mech.id]);
  await db.query("update users set technical = true where email = 'mgr@srd.mv'");
  sent = [];
  const res = await call('POST', '/work', { token: manager, body: { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Fuel leak', unit_id: mech.id } });
  assert.equal(res.status, 201);
  assert.match(repliesTo(ADMIN_TG), /Work for the Mechanical Unit: Fuel leak<\/b>[\s\S]*not assigned to anyone yet/);
  // Not when the head logs it themselves.
  sent = [];
  await call('POST', '/work', { token: admin, body: { island_id: maafushi.id, service: 'electricity', kind: 'repair', title: 'Own job', unit_id: mech.id } });
  assert.equal(repliesTo(ADMIN_TG), '');
  await db.query('update units set head_user_id = null where id = $1', [mech.id]);
});

test('alerts go to chats that turned them on; serious incidents from Telegram alert the group', async () => {
  await say(ADMIN_TG, '/alerts on', { id: GROUP, type: 'supergroup', title: 'SCRD Managers' });
  assert.match(repliesTo(GROUP), /Alerts are on/);

  await say(MANAGER_TG, '/interruption Maafushi high power cut to the harbour area');
  assert.match(repliesTo(MANAGER_TG), /Reported <b>INT-\d+<\/b>/);
  assert.match(repliesTo(GROUP), /🚨 <b>High: power cut to the harbour area<\/b>/);
  const inc = (await db.query(`select service, severity, category from incidents order by id desc limit 1`)).rows[0];
  assert.deepEqual(inc, { service: 'electricity', severity: 'high', category: 'outage' });
  // The genset named is linked, the time read, and the one already open mentioned.
  await say(MANAGER_TG, '/interruption Maafushi G3 tripped at 0:05, 120 customers');
  const said = repliesTo(MANAGER_TG);
  assert.match(said, /Electricity · outage · \w+ · Genset 3/, said);
  assert.match(said, /since 00:05 · 120 customers/);
  assert.match(said, /Already open here: .*INT-\d{6}.*power cut to the harbour area/);
  const linked = (await db.query(`select x.asset_id, s.tag, x.customers_affected from incidents x left join assets s on s.id = x.asset_id order by x.id desc limit 1`)).rows[0];
  assert.deepEqual([linked.tag, linked.customers_affected], ['3', 120]);

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
  assert.match(text, /📋 <b>SCRD summary/);
  assert.match(text, /gensets running/);
  assert.match(text, /Serious interruptions/);
  assert.doesNotMatch(text, /Condition reports missing/);
  assert.doesNotMatch(text, /Out of service/);
});

test('administrators see the bot settings and alert chats; others do not', async () => {
  const a = (await call('GET', '/telegram', { token: admin })).body;
  assert.equal(a.bot, 'srd_test_bot');
  assert.equal(a.chats.length, 1);
  assert.equal(a.chats[0].title, 'SCRD Managers');
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

test('a group set to non-technical alerts gets incidents but not genset alerts or the engine summary', async () => {
  assert.equal((await call('PATCH', `/telegram/chats/${GROUP}`, { token: admin, body: { alerts: true, technical: false } })).status, 200);
  await say(ADMIN_TG, '/down Maafushi 4 fuel pump');
  assert.equal(repliesTo(GROUP), '');
  await say(ADMIN_TG, '/incident Maafushi critical whole island without power');
  assert.match(repliesTo(GROUP), /Critical: whole island without power/);
  sent = [];
  await app.daily();
  assert.match(repliesTo(GROUP), /SCRD summary/);
  assert.doesNotMatch(repliesTo(GROUP), /gensets running/);
});

test('non-technical staff cannot use the technical bot commands', async () => {
  await db.query(`insert into users (email, full_name, role, technical, password_hash, must_change_password, telegram_user_id)
    select 'office@srd.mv', 'Office', 'manager', false, password_hash, false, 4004 from users where email = 'admin@srd.mv'`);
  await say(4004, '/status Maafushi');
  assert.match(repliesTo(4004), /needs technical access/);
  await say(4004, '/down Maafushi 1 broken');
  assert.match(repliesTo(4004), /needs technical access/);
});

test('/fault logs a genset fault, and clears it', async () => {
  const g4 = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id join islands i on i.id = f.island_id
    where i.name = 'Maafushi' and s.kind = 'genset' and s.tag = '4' and s.active`)).rows[0].id;
  const fault = async () => (await db.query('select fault_level, fault_note from assets where id = $1', [g4])).rows[0];
  // Clear first: the earlier /down Maafushi 4 fuel pump logged a fault.
  await say(ADMIN_TG, '/fault Maafushi G4 fixed');
  await say(ADMIN_TG, '/fault Maafushi G4 oil leak at the front seal');
  assert.match(repliesTo(ADMIN_TG), /Genset 4: <b>minor fault<\/b> logged: oil leak at the front seal/);
  assert.deepEqual(await fault(), { fault_level: 'minor', fault_note: 'oil leak at the front seal' });
  await say(ADMIN_TG, '/fault Maafushi G4 major crankshaft knock');
  assert.deepEqual(await fault(), { fault_level: 'major', fault_note: 'oil leak at the front seal; crankshaft knock' }, 'both faults');
  await say(ADMIN_TG, '/fault Maafushi G4');
  assert.match(repliesTo(ADMIN_TG), /e\.g\./);
  await say(ADMIN_TG, '/fault Maafushi G4 fixed');
  assert.match(repliesTo(ADMIN_TG), /faults cleared/);
  assert.deepEqual(await fault(), { fault_level: 'none', fault_note: null });
  const log = (await db.query('select level, cleared_reason from fault_log where asset_id = $1 order by logged_at', [g4])).rows;
  assert.deepEqual(log.slice(-2).map((l) => [l.level, l.cleared_reason]), [['minor', 'Marked fixed'], ['major', 'Marked fixed']]);
  await say(4004, '/fault Maafushi G4 leak');
  assert.match(repliesTo(4004), /needs technical access/);
});

test('/hours records the monthly running hours, with or without a condition', async () => {
  const at = async (tag) => (await db.query(`select s.id, c.total_hours, c.condition, c.fault, c.source from assets s
    join facilities f on f.id = s.facility_id join islands i on i.id = f.island_id
    left join engine_conditions c on c.asset_id = s.id where i.name = 'Maafushi' and s.kind = 'genset' and s.tag = $1 and s.active`, [tag])).rows[0];
  await say(ADMIN_TG, '/hours Maafushi G1 12,345 G2 23456');
  let reply = repliesTo(ADMIN_TG);
  assert.match(reply, /Hours recorded for <b>K\. Maafushi<\/b>/, reply);
  assert.match(reply, /Genset 1: 12,345 h/);
  assert.match(reply, /Still to do for .*: Genset /, 'the others are still due');
  assert.deepEqual(((g) => [Number(g.total_hours), g.source])(await at('1')), [12345, 'update']);

  // With a condition: it and the fault are recorded.
  await say(ADMIN_TG, '/hours Maafushi G3 30000 minor oil leak at the front seal');
  reply = repliesTo(ADMIN_TG);
  assert.match(reply, /Genset 3: 30,000 h · minor fault: oil leak at the front seal/, reply);
  assert.deepEqual(((g) => [g.condition, g.fault])(await at('3')), ['minor_fault', 'oil leak at the front seal']);
  // Hours only again: the condition stays.
  await say(ADMIN_TG, '/hours Maafushi G3 30100');
  assert.deepEqual(((g) => [Number(g.total_hours), g.condition])(await at('3')), [30100, 'minor_fault']);

  // A fault needs a description; lower hours need "newmeter"; the genset must exist.
  await say(ADMIN_TG, '/hours Maafushi G3 30200 major');
  assert.match(repliesTo(ADMIN_TG), /Say what's wrong/);
  await say(ADMIN_TG, '/hours Maafushi G1 100');
  assert.match(repliesTo(ADMIN_TG), /less than the last reading \(12345\)/);
  await say(ADMIN_TG, '/hours Maafushi G1 100 newmeter');
  assert.match(repliesTo(ADMIN_TG), /Genset 1: 100 h \(new meter\)/);
  await say(ADMIN_TG, '/hours Maafushi G99 5');
  assert.match(repliesTo(ADMIN_TG), /Which genset\?/);
  await say(4004, '/hours Maafushi G1 5');
  assert.match(repliesTo(4004), /needs technical access/);
});

test('genset move stages can be posted from Telegram', async () => {
  const isl = (await call('GET', '/islands', { token: admin })).body;
  const huraa = isl.find((i) => i.name === 'Huraa');
  const ph = (await db.query(`select id from facilities where island_id = $1 and kind = 'powerhouse'`, [huraa.id])).rows[0].id;
  const g5 = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '5' and s.kind = 'genset'`, [maafushi.id])).rows[0].id;
  const w = (await call('POST', '/work', { token: admin, body: { asset_id: g5, kind: 'relocation', title: 'Move G5', dest_facility_id: ph, dest_tag: '9' } })).body;
  await say(ADMIN_TG, `/update WO-${w.id} transit loaded on the vessel`);
  assert.match(repliesTo(ADMIN_TG), /Status: <b>In transit<\/b>/);
  assert.equal((await db.query('select status from work_orders where id = $1', [w.id])).rows[0].status, 'in_transit');
  assert.equal((await db.query('select status from assets where id = $1', [g5])).rows[0].status, 'maintenance');
});

test('the bot acts as the person without creating sessions for it', async () => {
  const count = async () => (await db.query('select count(*)::int n from sessions')).rows[0].n;
  const before = await count();
  await say(ADMIN_TG, '/status Maafushi');
  assert.match(repliesTo(ADMIN_TG), /Maafushi/);
  assert.equal(await count(), before);
});

test('/status shows each genset once: one state, the reason once, work by reference', async () => {
  await say(ADMIN_TG, '/down Maafushi 7 voltage issue');
  await say(ADMIN_TG, '/status Maafushi');
  const line = repliesTo(ADMIN_TG).split('\n').find((l) => l.includes('Genset 7:'));
  assert.match(line, /^🔴 Genset 7: down: voltage issue · 🔧 WO-\d{4} \(Planned\)$/);
  assert.doesNotMatch(line, /not running/);
});

test('/status shows the latest update under each ongoing work item', async () => {
  const w = (await call('GET', `/work?asset_id=${(await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '7' and s.kind = 'genset'`, [maafushi.id])).rows[0].id}`, { token: admin })).body.items[0];
  await call('POST', `/work/${w.id}/updates`, { token: admin, body: { body: 'AVR replaced, testing tomorrow', status: 'in_progress' } });
  await say(ADMIN_TG, '/status Maafushi');
  const text = repliesTo(ADMIN_TG);
  assert.match(text, new RegExp(`• WO-${String(w.id).padStart(4, '0')} .*\\(In progress\\)\\n   ↳ AVR replaced, testing tomorrow · \\d+ \\w+, \\d\\d:\\d\\d · Admin`));
});

test('the morning summary lists ongoing work with its status and latest update', async () => {
  sent = [];
  await call('PATCH', `/telegram/chats/${GROUP}`, { token: admin, body: { alerts: true, technical: true } });
  await app.daily();
  const text = repliesTo(GROUP);
  assert.match(text, /<b>Ongoing work<\/b> \(\d+\)/);
  assert.match(text, /WO-\d{4}<\/a> K\. Maafushi Genset 7: Genset 7 down: voltage issue · <b>In progress<\/b>\n   ↳ AVR replaced, testing tomorrow \(\d+ \w+\)/);

  // Work on hold is counted, not listed.
  const held = (await call('POST', '/work', { token: admin, body: { island_id: maafushi.id, service: 'water', kind: 'repair', title: 'Parked job', status: 'on_hold' } })).body;
  sent = [];
  await app.daily();
  const again = repliesTo(GROUP);
  assert.ok(!again.includes('Parked job'), again);
  assert.match(again, /work in progress \(\d+ more on hold\)/);
  await call('PATCH', `/work/${held.id}`, { token: admin, body: { status: 'cancelled' } });
});

test('plain messages go to the assistant, which looks things up as the person asking', async () => {
  await db.query("update users set telegram_user_id = $1, technical = true where email = 'mgr@srd.mv'", [MANAGER_TG]);
  claudeRequests = [];
  claudeScript = [
    () => [toolUse('find_island', { name: 'maafushi' })],
    (body) => {
      const [r] = lastToolResults(body);
      assert.equal(JSON.parse(r.content).island.id, maafushi.id);
      return [toolUse('get_island', { island_id: maafushi.id })];
    },
    (body) => {
      assert.match(lastToolResults(body)[0].content, /Powerhouse|facilities/i);
      return [{ type: 'thinking', thinking: 'All running.', signature: 'sig' }, { type: 'text', text: 'Maafushi: **all gensets running**.' }];
    },
  ];
  await say(MANAGER_TG, 'how is maafushi doing?');
  assert.equal(repliesTo(MANAGER_TG), 'Maafushi: <b>all gensets running</b>.');
  assert.equal(claudeRequests[0].model, 'claude-haiku-5-5');
  assert.match(claudeRequests[0].system.map((b) => b.text).join(' '), /Maafushi Manager \(manager/);

  // A follow-up continues the same conversation.
  claudeScript = [(body) => {
    assert.equal(body.messages.length, 7);
    assert.equal(body.messages.at(-1).content.at(-1).text, 'and the work there?');
    // The island looked up for the first question isn't resent in full.
    assert.match(body.messages[4].content[0].content, /earlier result, shortened/);
    assert.ok(body.messages[4].content[0].content.length < 450);
    // Past thinking isn't sent back: its signature wouldn't match the shortened history.
    assert.ok(!JSON.stringify(body.messages).includes('"thinking"'));
    return [{ type: 'text', text: 'No ongoing work.' }];
  }];
  await say(MANAGER_TG, 'and the work there?');
  assert.equal(repliesTo(MANAGER_TG), 'No ongoing work.');
  assert.equal(claudeScript.length, 0);
});

test('the assistant looks up projects with the project tools, not work', async () => {
  await db.query("insert into projects (title, status, visibility, project_type) values ('Solar extension', 'ongoing', 'everyone', 'electrical')");
  claudeScript = [
    (body) => {
      assert.ok(body.tools.some((t) => t.name === 'list_projects') && body.tools.some((t) => t.name === 'get_project'));
      assert.match(body.system.map((b) => b.text).join(' '), /Projects \(PRJ-0001/);
      return [toolUse('list_projects', {})];
    },
    (body) => {
      const r = JSON.parse(lastToolResults(body)[0].content);
      const p = r.items.find((x) => x.title === 'Solar extension');
      assert.ok(p && /^PRJ-\d{4}$/.test(p.ref), JSON.stringify(r).slice(0, 200));
      return [toolUse('get_project', { project_id: p.project_id })];
    },
    (body) => {
      assert.match(lastToolResults(body)[0].content, /"title":"Solar extension"/);
      return [{ type: 'text', text: 'One project.' }];
    },
  ];
  await say(MANAGER_TG, 'what are the ongoing projects');
  assert.equal(repliesTo(MANAGER_TG), 'One project.');
});

test('the assistant records running hours once confirmed, and calls them the monthly update', async () => {
  const g5 = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '5' and s.kind = 'genset'`, [maafushi.id])).rows[0];
  const hours = async () => (await db.query('select total_hours from engine_conditions where asset_id = $1', [g5.id])).rows[0]?.total_hours;
  claudeScript = [(body) => {
    assert.match(body.system.map((b) => b.text).join(' '), /never a "report"/);
    assert.ok(body.tools.some((t) => t.name === 'record_hours'));
    return [toolUse('record_hours', { asset_id: g5.id, total_hours: 41200 })];
  }];
  await say(MANAGER_TG, 'maafushi g5 is at 41200 hours');
  const proposal = sent.find((m) => m.chat_id === MANAGER_TG);
  assert.match(proposal.text, /Record <b>K\. Maafushi Genset 5<\/b>: <b>41,200 h<\/b>/, proposal.text);
  assert.equal(await hours(), undefined, 'nothing saved before the tap');
  await tap(MANAGER_TG, proposal.reply_markup.inline_keyboard[0][0].callback_data);
  assert.match(repliesTo(MANAGER_TG), /✅ Hours recorded/);
  assert.equal(Number(await hours()), 41200);
  // A lower reading is questioned before anything is proposed.
  claudeScript = [() => [toolUse('record_hours', { asset_id: g5.id, total_hours: 100 })],
    (body) => { assert.match(lastToolResults(body)[0].content, /less than the last reading/); return [{ type: 'text', text: 'Was the meter replaced?' }]; }];
  await say(MANAGER_TG, 'g5 100 hours');
  assert.equal(repliesTo(MANAGER_TG), 'Was the meter replaced?');
});

test('the assistant only writes after the person taps ✅', async () => {
  const g3 = (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = '3'`, [maafushi.id])).rows[0];
  const statusOf = async () => (await db.query('select status from assets where id = $1', [g3.id])).rows[0].status;
  await db.query("update assets set status = 'running' where id = $1", [g3.id]);

  claudeScript = [() => [{ type: 'text', text: 'Got it.' }, toolUse('set_asset_status', { asset_id: g3.id, status: 'down', note: 'radiator leak' })]];
  await say(MANAGER_TG, 'maafushi g3 radiator leak, stopped it');
  const proposal = sent.find((m) => m.chat_id === MANAGER_TG);
  assert.match(proposal.text, /Set <b>K\. Maafushi Genset 3<\/b> to <b>down<\/b>: radiator leak/);
  const [yes, no] = proposal.reply_markup.inline_keyboard[0];
  assert.match(yes.callback_data, /^ag:[0-9a-f]+:y$/);
  assert.equal(await statusOf(), 'running');

  // Someone else can't confirm it.
  await tap(ADMIN_TG, yes.callback_data, MANAGER_TG);
  assert.equal(await statusOf(), 'running');

  await tap(MANAGER_TG, yes.callback_data);
  assert.match(repliesTo(MANAGER_TG), /✅ Status saved: <b>down<\/b>/);
  assert.equal(await statusOf(), 'down');
  // Only once.
  await tap(MANAGER_TG, yes.callback_data);
  assert.equal(repliesTo(MANAGER_TG), '');

  // ❌ changes nothing, and Claude hears how it went next time.
  claudeScript = [() => [toolUse('set_asset_status', { asset_id: g3.id, status: 'running' })]];
  await say(MANAGER_TG, 'g3 is back up');
  const back = sent.find((m) => m.chat_id === MANAGER_TG).reply_markup.inline_keyboard[0][1];
  await tap(MANAGER_TG, back.callback_data);
  assert.match(repliesTo(MANAGER_TG), /Cancelled/);
  assert.equal(await statusOf(), 'down');
  claudeScript = [(body) => {
    const results = body.messages.at(-2).content;
    assert.match(results[0].content, /tapped ❌/);
    return [{ type: 'text', text: 'OK.' }];
  }];
  await say(MANAGER_TG, 'thanks');
  assert.equal(claudeScript.length, 0);
});

test('several changes in one message are proposed and confirmed together', async () => {
  const tagged = async (tag) => (await db.query(`select s.id from assets s join facilities f on f.id = s.facility_id where f.island_id = $1 and s.tag = $2 and s.kind = 'genset'`, [maafushi.id, tag])).rows[0].id;
  const g3 = await tagged('3');
  const g5 = await tagged('5');
  const statusOf = async (assetId) => (await db.query('select status from assets where id = $1', [assetId])).rows[0].status;
  await db.query("update assets set status = 'down' where id = any($1)", [[g3, g5]]);
  claudeScript = [(body) => {
    assert.match(body.system.map((b) => b.text).join(' '), /propose them all in the same turn/);
    return [toolUse('set_asset_status', { asset_id: g3, status: 'running' }), toolUse('set_asset_status', { asset_id: g5, status: 'standby' })];
  }];
  await say(MANAGER_TG, 'maafushi g3 back up, g5 on standby');
  const proposal = sent.find((m) => m.chat_id === MANAGER_TG);
  assert.match(proposal.text, /1\. Set <b>K\. Maafushi Genset 3<\/b> to <b>running<\/b>[\s\S]*2\. Set <b>K\. Maafushi Genset 5<\/b> to <b>standby<\/b>/, proposal.text);
  const [yes] = proposal.reply_markup.inline_keyboard[0];
  assert.match(yes.text, /save all 2/);
  assert.equal(await statusOf(g3), 'down', 'nothing saved before the tap');
  await tap(MANAGER_TG, yes.callback_data);
  assert.match(repliesTo(MANAGER_TG), /✅ Status saved: <b>running<\/b>\n✅ Status saved: <b>standby<\/b>/);
  assert.equal(await statusOf(g3), 'running');
  assert.equal(await statusOf(g5), 'standby');
  // Claude hears how both went.
  claudeScript = [(body) => {
    const results = body.messages.at(-2).content.filter((b) => b.type === 'tool_result');
    assert.equal(results.length, 2);
    assert.ok(results.every((x) => /confirmed/.test(x.content)));
    return [{ type: 'text', text: 'OK.' }];
  }];
  await say(MANAGER_TG, 'thanks');
  assert.equal(claudeScript.length, 0);
});

test('a proposed change lapses when the person writes something else instead', async () => {
  claudeScript = [() => [toolUse('add_work_update', { work_id: 999999, text: 'hello' })], (body) => {
    assert.match(lastToolResults(body)[0].content, /not found/i);
    return [{ type: 'text', text: "I can't find WO-999999." }];
  }];
  await say(MANAGER_TG, 'update WO-999999 hello');
  assert.match(repliesTo(MANAGER_TG), /can't find/);
  assert.equal(sent[0].reply_markup, undefined);
});

test('in groups the assistant answers only when mentioned', async () => {
  claudeScript = [];
  await say(MANAGER_TG, 'how is maafushi', { id: GROUP, type: 'supergroup', title: 'SCRD' });
  assert.equal(sent.length, 0);
  claudeScript = [(body) => {
    assert.equal(body.messages.at(-1).content.at(-1).text, 'how is maafushi');
    return [{ type: 'text', text: 'Fine.' }];
  }];
  await say(MANAGER_TG, '@srd_test_bot how is maafushi', { id: GROUP, type: 'supergroup', title: 'SCRD' });
  assert.equal(repliesTo(GROUP), 'Fine.');
});
