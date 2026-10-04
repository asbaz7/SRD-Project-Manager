// Telegram bot: alerts to group chats, a daily summary, and reporting from
// Telegram ("/down Maafushi G3 radiator leak").
//
// Each manager links their Telegram account to their login once, with a
// short-lived code from their account page. The bot then performs actions by
// calling the API as that user, so the website's rules apply unchanged:
// role, island scope, validation and the audit trail.
//
// Configuration: the TELEGRAM_BOT_TOKEN secret (from @BotFather) and
// PUBLIC_URL (for links). Without a token the bot is off and alerts are no-ops.
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { matchIsland } from './reportImport.js';

const API = 'https://api.telegram.org';
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_TTL_MINUTES = 15;

const ASSET_LABELS = {
  genset: 'Genset', solar_inverter: 'Solar inverter', battery: 'Battery', transformer: 'Transformer',
  ro_unit: 'RO unit', pump: 'Pump', blower: 'Blower', tank: 'Tank', other: '',
};
const SERVICE_ICON = { electricity: '⚡', water: '💧', sewerage: '♻️' };
const SERVICE_LABEL = { electricity: 'Electricity', water: 'Water', sewerage: 'Sewerage' };
const STATUS_WORDS = { up: 'running', running: 'running', standby: 'standby', down: 'down', maintenance: 'maintenance' };
const STATUS_ICON = { running: '🟢', standby: '⚪', down: '🔴', maintenance: '🟠', decommissioned: '⚫', unknown: '❔' };
const CONDITION_LABEL = { ok: 'OK', minor_fault: 'minor fault', major_fault: 'major fault', not_running: 'not running' };
const WORK_STATE_WORDS = {
  planned: 'planned', progress: 'in_progress', in_progress: 'in_progress', started: 'in_progress',
  parts: 'awaiting_parts', awaiting_parts: 'awaiting_parts', hold: 'on_hold', on_hold: 'on_hold',
  done: 'completed', completed: 'completed', complete: 'completed', cancelled: 'cancelled', canceled: 'cancelled',
};
const WORK_STATE_LABEL = {
  planned: 'Planned', in_progress: 'In progress', awaiting_parts: 'Awaiting parts', on_hold: 'On hold',
  completed: 'Completed', cancelled: 'Cancelled',
};
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const assetName = (a) => `${ASSET_LABELS[a.kind] ?? ''} ${a.tag}`.trim();
const where = (a) => `${a.atoll_code}. ${a.island_name}`;

// Telegram signs nothing, so the webhook URL is registered with a secret that
// Telegram echoes back in a header. Derived from the token: nothing extra to store.
export const webhookSecret = (token) => createHash('sha256').update(`srd-telegram-webhook:${token}`).digest('hex').slice(0, 48);

const HELP = `<b>SRD Utility Bot</b>

<b>Look things up</b>
/status Maafushi: gensets, plants, faults and work on an island
/work: ongoing work (add an island to narrow it down)
/summary: today's summary

<b>Report</b> (managers, for their own islands)
/down Maafushi G3 radiator leak
/up Maafushi G3
/standby or /maintenance work the same way
/incident Guraidhoo water high supply cut to north ward
  <i>(service and severity are optional: electricity is assumed)</i>
/update WO-12 seal arrived, fitting tomorrow
/update WO-12 parts waiting for crankshaft
/done WO-12 engine back in service

<b>Alerts</b>
/alerts on: send alerts and the daily summary to this chat
/alerts off: stop them

/unlink: disconnect your Telegram from your login`;

export function createTelegram({ db, config, log }) {
  const token = config.telegramToken;
  const publicUrl = (config.publicUrl || '').replace(/\/$/, '');
  const link = (path, label) => (publicUrl ? `<a href="${esc(publicUrl + path)}">${esc(label)}</a>` : esc(label));
  let me = null;

  async function call(method, params = {}) {
    const res = await fetch(`${API}/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) {
      const err = new Error(`Telegram ${method}: ${json.description || res.status}`);
      err.code = json.error_code || res.status;
      throw err;
    }
    return json.result;
  }

  const send = (chatId, text, extra = {}) =>
    call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });

  async function botInfo() {
    if (!token) return null;
    me ??= await call('getMe');
    return me;
  }

  // Post to every chat that has alerts on. Never throws: an alert that can't
  // be delivered must not undo the change that caused it.
  async function alert(text) {
    if (!token) return;
    try {
      const { rows } = await db.query('select chat_id from telegram_chats where alerts');
      await Promise.all(rows.map(async ({ chat_id: chatId }) => {
        try {
          await send(chatId, text);
        } catch (err) {
          log.warn({ err: { message: err.message }, chatId }, 'telegram alert failed');
          // Removed from the group or blocked by the user: stop trying.
          if (err.code === 403 || err.code === 400) await db.query('update telegram_chats set alerts = false where chat_id = $1', [chatId]);
        }
      }));
    } catch (err) {
      log.warn({ err: { message: err.message } }, 'telegram alerts failed');
    }
  }

  async function createLinkCode(userId) {
    const code = Array.from({ length: 8 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
    await db.query('delete from telegram_link_codes where user_id = $1 or expires_at < now()', [userId]);
    const { rows } = await db.query(
      `insert into telegram_link_codes (code, user_id, expires_at) values ($1, $2, now() + make_interval(mins => $3)) returning expires_at`,
      [code, userId, CODE_TTL_MINUTES]);
    const bot = await botInfo();
    return { code, expires_at: rows[0].expires_at, bot: bot?.username, url: bot ? `https://t.me/${bot.username}?start=${code}` : null };
  }

  // Register the webhook and the command menu with Telegram.
  async function connect() {
    if (!publicUrl) throw new Error('PUBLIC_URL is not configured');
    await call('setWebhook', {
      url: `${publicUrl}/api/v1/telegram/webhook`,
      secret_token: webhookSecret(token),
      allowed_updates: ['message'],
      drop_pending_updates: true,
    });
    await call('setMyCommands', {
      commands: [
        ['status', 'Island status: /status Maafushi'],
        ['work', 'Ongoing work'],
        ['down', 'Asset down: /down Maafushi G3 reason'],
        ['up', 'Asset running again: /up Maafushi G3'],
        ['incident', 'Report an incident'],
        ['update', 'Work update: /update WO-12 text'],
        ['done', 'Work completed: /done WO-12 note'],
        ['summary', "Today's summary"],
        ['alerts', 'Alerts in this chat: on / off'],
        ['help', 'How to use the bot'],
      ].map(([command, description]) => ({ command, description })),
    });
    const info = await call('getWebhookInfo');
    return { ok: true, bot: (await botInfo())?.username, webhook: info.url, pending: info.pending_update_count };
  }

  async function status() {
    if (!token) return { enabled: false };
    try {
      const [bot, hook] = await Promise.all([botInfo(), call('getWebhookInfo')]);
      return {
        enabled: true, bot: bot.username, connected: !!hook.url && hook.url.startsWith(publicUrl),
        last_error: hook.last_error_message || null,
      };
    } catch (err) {
      // Describe the stored token without revealing it.
      const shape = /^\d{6,12}:[A-Za-z0-9_-]{30,40}$/.test(token)
        ? 'The token looks right but Telegram rejects it: it may have been revoked. Copy the current one from @BotFather (/token) and store it again.'
        : `The stored token isn't in Telegram's format (${token.length} characters; it should look like 123456789:ABC…). The clipboard probably held something else when it was stored.`;
      return { enabled: true, error: err.code === 404 || err.code === 401 ? shape : err.message };
    }
  }

  // ---- Daily summary ------------------------------------------------------
  async function summaryText(asUser) {
    const { rows } = await db.query(`select id from users where role = 'admin' and active order by created_at limit 1`);
    if (!rows[0]) return null;
    const res = await asUser(rows[0].id, 'GET', '/dashboard');
    if (res.status !== 200) throw new Error(`dashboard: ${res.status}`);
    const d = res.body;
    const el = d.services.electricity;
    const e = d.engines || {};
    const day = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: config.timezone });
    const mw = (kw) => (kw >= 10000 ? `${(kw / 1000).toFixed(1)} MW` : `${Math.round(kw)} kW`);
    const lines = [
      `📋 <b>SRD summary: ${esc(day)}</b>`,
      `⚡ ${el.running}/${el.assets} gensets running · ${mw(el.available_kw)} available`,
      `   ${e.not_running ?? 0} not running · ${e.major_fault ?? 0} major fault · ${e.minor_fault ?? 0} minor`,
    ];
    for (const s of ['water', 'sewerage']) {
      const v = d.services[s];
      if (v.assets) lines.push(`${SERVICE_ICON[s]} ${v.running}/${v.assets} ${SERVICE_LABEL[s].toLowerCase()} assets running${v.down ? ` · ${v.down} out of service` : ''}`);
    }
    lines.push(`🔧 ${d.work.length} work in progress · 🚨 ${d.incidents.open} open incidents`);
    const down = (d.assets_down || []).slice(0, 10);
    if (down.length) lines.push('', '<b>Out of service</b>', ...down.map((a) => `• ${esc(where(a))} ${esc(assetName(a))}${a.status_note ? `: ${esc(a.status_note.slice(0, 80))}` : ''}`));
    const inc = (d.incidents.list || []).filter((i) => ['high', 'critical'].includes(i.severity)).slice(0, 5);
    if (inc.length) lines.push('', '<b>Serious incidents</b>', ...inc.map((i) => `• ${esc(i.title)} (${esc(i.atoll_code)}. ${esc(i.island_name)})`));
    const missing = d.reports?.missing || [];
    if (missing.length) {
      const month = new Date(`${d.reports.expected_month}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
      const names = missing.slice(0, 15).map((r) => `${esc(r.atoll_code)}. ${esc(r.island_name)}`).join(', ');
      lines.push('', `<b>Condition reports missing for ${month}</b>`, names + (missing.length > 15 ? ` and ${missing.length - 15} more` : ''));
    }
    lines.push('', link('/', 'Open the dashboard'));
    return lines.join('\n');
  }

  async function daily(asUser) {
    if (!token) return;
    const text = await summaryText(asUser);
    if (text) await alert(text);
  }

  // ---- Commands -----------------------------------------------------------
  async function linkedUser(telegramId) {
    const { rows } = await db.query(
      'select id, full_name, role from users where telegram_user_id = $1 and active', [telegramId]);
    return rows[0] || null;
  }

  async function islands() {
    return (await db.query(`select i.id, i.name, a.code as atoll_code, i.atoll_id from islands i join atolls a on a.id = i.atoll_id where i.active`)).rows;
  }

  // "K. Maafushi G3 note" / "Maafushi G3 note" -> island + the rest.
  async function takeIsland(words) {
    const all = await islands();
    const tries = words.length > 1 && /^[a-z]{1,3}\.?$/i.test(words[0]) ? [2, 1] : [1, 2];
    for (const n of tries) {
      if (words.length < n) continue;
      const { island, candidates } = matchIsland(all, words.slice(0, n).join(' '));
      if (island) return { island: all.find((i) => i.id === island.id), rest: words.slice(n) };
      if (n === tries[tries.length - 1] && candidates.length) return { candidates };
    }
    return {};
  }

  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '').replace(/^(genset|gen|engine|eng|dg|g|unit|no)(?=\d)/, '');

  // "G3", "Genset 3", "3", "RO-1", "RO 1" -> the asset on that island.
  async function takeAsset(islandId, words) {
    const { rows } = await db.query(
      `select s.id, s.kind, s.tag, s.status, f.service from assets s join facilities f on f.id = s.facility_id
        where f.island_id = $1 and s.active and f.active`, [islandId]);
    for (const n of [2, 1]) {
      if (words.length < n) continue;
      const key = norm(words.slice(0, n).join(''));
      if (!key) continue;
      const hits = rows.filter((a) => norm(a.tag) === key || norm(`${a.kind}${a.tag}`) === key);
      if (hits.length === 1) return { asset: hits[0], rest: words.slice(n) };
      if (hits.length > 1) return { ambiguous: hits };
    }
    return { options: rows };
  }

  const islandHelp = (r) => (r.candidates?.length
    ? `Which island? ${r.candidates.map((c) => `${c.atoll_code}. ${c.name}`).join(', ')}`
    : "I couldn't find that island. Try e.g. <code>/status Maafushi</code> or <code>/status K Maafushi</code>.");

  const apiError = (res) => esc(res.body?.error || `Something went wrong (${res.status})`);

  async function cmdStatus(user, words, asUser) {
    if (!words.length) return 'Which island? e.g. <code>/status Maafushi</code>';
    const r = await takeIsland(words);
    if (!r.island) return islandHelp(r);
    const res = await asUser(user.id, 'GET', `/islands/${r.island.id}`);
    if (res.status !== 200) return apiError(res);
    const isl = res.body;
    const lines = [`<b>${esc(r.island.atoll_code)}. ${esc(isl.name)}</b>`];
    for (const f of (isl.facilities || []).filter((x) => x.active)) {
      const assets = f.assets.filter((a) => a.active);
      lines.push('', `${SERVICE_ICON[f.service] || ''} <b>${esc(f.name)}</b> (${assets.filter((a) => a.status === 'running').length}/${assets.length} running)`);
      for (const a of assets) {
        const cond = a.condition && a.condition !== 'ok' ? `, ${CONDITION_LABEL[a.condition]}` : '';
        const note = a.fault || a.status_note;
        const work = (a.open_work || []).map((w) => `🔧 ${esc(w.title)}`).join(' ');
        const why = note && (a.status !== 'running' || cond) ? ` (${esc(String(note).slice(0, 90))})` : '';
        lines.push(`${STATUS_ICON[a.status] || ''} ${esc(assetName(a))}: ${esc(a.status)}${cond}${why}${work ? ` ${work}` : ''}`);
      }
    }
    const work = isl.open_work || [];
    if (work.length) lines.push('', '<b>Ongoing work</b>', ...work.slice(0, 8).map((w) => `• ${esc(w.ref)} ${esc(w.title)} (${WORK_STATE_LABEL[w.status]})`));
    const month = isl.reports?.[0]?.report_month;
    if (month) lines.push('', `Latest condition report: ${new Date(`${month}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}`);
    lines.push('', link(`/islands/${r.island.id}`, 'Open on the website'));
    return lines.join('\n');
  }

  async function cmdSetStatus(user, status, words, asUser) {
    if (words.length < 2) return `e.g. <code>/${status === 'running' ? 'up' : status} Maafushi G3${status === 'running' ? '' : ' radiator leak'}</code>`;
    const r = await takeIsland(words);
    if (!r.island) return islandHelp(r);
    const a = await takeAsset(r.island.id, r.rest);
    if (a.ambiguous) return `More than one matches: ${a.ambiguous.map((x) => `${SERVICE_LABEL[x.service]} ${esc(assetName(x))}`).join(', ')}. Use the full tag.`;
    if (!a.asset) {
      const opts = (a.options || []).map((x) => esc(assetName(x))).join(', ');
      return opts ? `Which one? ${r.island.name} has: ${opts}` : `${esc(r.island.name)} has no assets registered.`;
    }
    const note = a.rest.join(' ').trim().slice(0, 1000) || null;
    if (status === 'down' && !note) return `Say what's wrong, e.g. <code>/down ${esc(r.island.name)} ${esc(a.asset.tag)} radiator leak</code>`;
    const res = await asUser(user.id, 'POST', '/assets/status', { items: [{ asset_id: a.asset.id, status, note }] });
    if (res.status !== 200) return apiError(res);
    return `${STATUS_ICON[status]} ${esc(r.island.atoll_code)}. ${esc(r.island.name)} ${esc(assetName(a.asset))} is now <b>${status}</b>${note ? `: ${esc(note)}` : ''}\n${link(`/assets/${a.asset.id}`, 'Open')}`;
  }

  async function cmdIncident(user, words, asUser) {
    const r = words.length ? await takeIsland(words) : {};
    if (!r.island) return words.length ? islandHelp(r) : 'e.g. <code>/incident Guraidhoo water high supply cut to north ward</code>';
    let rest = r.rest;
    let service = null;
    let severity = 'medium';
    for (let i = 0; i < 2 && rest.length; i++) {
      const w = rest[0].toLowerCase();
      if (['electricity', 'water', 'sewerage'].includes(w)) {
        service = w;
        rest = rest.slice(1);
      } else if (SEVERITIES.includes(w)) {
        severity = w;
        rest = rest.slice(1);
      }
    }
    const title = rest.join(' ').trim();
    if (title.length < 3) return 'Add a short description, e.g. <code>/incident Maafushi high power cut to the harbour area</code>';
    const lower = title.toLowerCase();
    service ??= /\b(sewer|sewage|stp)/.test(lower) ? 'sewerage' : /\b(water|ro|desal)/.test(lower) && !/\b(power|electric|genset|engine)/.test(lower) ? 'water' : 'electricity';
    const category = /\b(outage|cut|blackout|no power|no water|trip|tripped|supply)/.test(lower) ? 'outage' : 'breakdown';
    const res = await asUser(user.id, 'POST', '/incidents', {
      service, island_id: r.island.id, category, severity, title: title.slice(0, 200), started_at: new Date().toISOString(),
    });
    if (res.status !== 201) return apiError(res);
    return `🚨 Reported <b>${esc(res.body.ref)}</b>: ${esc(title)}\n${SERVICE_LABEL[service]} · ${severity} · ${esc(r.island.atoll_code)}. ${esc(r.island.name)}\n${link(`/incidents/${res.body.id}`, 'Open (add details there)')}`;
  }

  async function cmdWorkUpdate(user, words, asUser, forceStatus) {
    const m = /^(?:wo-?)?0*(\d+)$/i.exec(words[0] || '');
    if (!m) return forceStatus ? 'e.g. <code>/done WO-12 engine back in service</code>' : 'e.g. <code>/update WO-12 seal arrived, fitting tomorrow</code>';
    let rest = words.slice(1);
    let status = forceStatus || null;
    if (!status && rest.length && WORK_STATE_WORDS[rest[0].toLowerCase()]) {
      status = WORK_STATE_WORDS[rest[0].toLowerCase()];
      rest = rest.slice(1);
    }
    const body = rest.join(' ').trim() || (status ? WORK_STATE_LABEL[status] : '');
    if (!body) return 'Add the update text after the work number.';
    const res = await asUser(user.id, 'POST', `/work/${m[1]}/updates`, { body: body.slice(0, 5000), status });
    if (res.status === 404) return `There's no work order WO-${m[1].padStart(4, '0')}.`;
    if (res.status !== 201) return apiError(res);
    const w = await asUser(user.id, 'GET', `/work/${m[1]}`);
    const title = w.body?.title ? `: ${esc(w.body.title)}` : '';
    return `🔧 Update added to <b>WO-${m[1].padStart(4, '0')}</b>${title}${status ? `\nStatus: <b>${WORK_STATE_LABEL[status]}</b>` : ''}\n${link(`/work/${m[1]}`, 'Open')}`;
  }

  async function cmdWork(user, words, asUser) {
    let q = '?status=open&limit=15';
    let label = 'all islands';
    if (words.length) {
      const r = await takeIsland(words);
      if (!r.island) return islandHelp(r);
      q += `&island_id=${r.island.id}`;
      label = `${r.island.atoll_code}. ${r.island.name}`;
    }
    const res = await asUser(user.id, 'GET', `/work${q}`);
    if (res.status !== 200) return apiError(res);
    const items = res.body.items || [];
    if (!items.length) return `No work in progress (${esc(label)}).`;
    return [`🔧 <b>Ongoing work: ${esc(label)}</b> (${res.body.total ?? items.length})`,
      ...items.map((w) => `• <b>${esc(w.ref)}</b> ${esc(w.title)}\n   ${esc(w.atoll_code)}. ${esc(w.island_name)}${w.asset_tag ? ` · ${esc(assetName({ kind: w.asset_kind, tag: w.asset_tag }))}` : ''} · ${WORK_STATE_LABEL[w.status]}${w.overdue ? ' · ⚠ overdue' : ''}`),
      '', link('/work', 'All work')].join('\n');
  }

  async function cmdAlerts(user, words, chat) {
    if (user.role === 'viewer') return 'Only managers and administrators can turn alerts on or off.';
    const on = !/^(off|stop|no)$/i.test(words[0] || 'on');
    const title = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.username || null;
    await db.tx(user.id, (t) => t.query(
      `insert into telegram_chats (chat_id, title, alerts, added_by) values ($1, $2, $3, $4)
       on conflict (chat_id) do update set title = excluded.title, alerts = excluded.alerts`,
      [chat.id, title, on, user.id]));
    return on
      ? '🔔 Alerts are on for this chat: serious incidents, assets going down or back up, completed work, and a summary every morning. Send <code>/alerts off</code> to stop.'
      : '🔕 Alerts are off for this chat.';
  }

  async function cmdLink(code, from, chat) {
    if (chat.type !== 'private') return 'Send the link code to me in a private chat, not in a group.';
    const { rows } = await db.query(
      `select c.user_id, u.full_name, u.role from telegram_link_codes c join users u on u.id = c.user_id and u.active
        where c.code = $1 and c.expires_at > now()`, [code.toUpperCase()]);
    if (!rows[0]) return 'That code is wrong or has expired. Get a new one from your account page on the website.';
    const name = from.username ? `@${from.username}` : [from.first_name, from.last_name].filter(Boolean).join(' ');
    await db.tx(rows[0].user_id, async (t) => {
      await t.query('update users set telegram_user_id = null, telegram_name = null where telegram_user_id = $1 and id <> $2', [from.id, rows[0].user_id]);
      await t.query('update users set telegram_user_id = $1, telegram_name = $2 where id = $3', [from.id, name.slice(0, 100), rows[0].user_id]);
      await t.query('delete from telegram_link_codes where user_id = $1', [rows[0].user_id]);
    });
    return `✅ Linked to <b>${esc(rows[0].full_name)}</b> (${rows[0].role}). What you report here is recorded under your name.\n\n${HELP}`;
  }

  // One incoming Telegram update. Returns nothing; replies are sent directly.
  async function handleUpdate(update, asUser) {
    const msg = update.message;
    if (!msg?.text || !msg.from || msg.from.is_bot) return;
    const chat = msg.chat;
    const m = /^\/([a-z_]+)(?:@(\w+))?(?:\s+([\s\S]*))?$/i.exec(msg.text.trim());
    if (!m) {
      if (chat.type === 'private') await send(chat.id, 'Send /help to see what I can do.');
      return;
    }
    const [, rawCmd, mention, argText = ''] = m;
    if (mention && me && mention.toLowerCase() !== me.username.toLowerCase()) return;
    const cmd = rawCmd.toLowerCase();
    const words = argText.trim().split(/\s+/).filter(Boolean);
    const reply = (text) => send(chat.id, text, { reply_parameters: { message_id: msg.message_id, allow_sending_without_reply: true } });

    if (cmd === 'start' && words[0]) return reply(await cmdLink(words[0], msg.from, chat));
    if (cmd === 'start' || cmd === 'help') {
      const user = await linkedUser(msg.from.id);
      return reply(user ? HELP : `${HELP}\n\n<b>First, link your account:</b> on the website, open your name (bottom left) → <b>Link Telegram</b>.`);
    }
    const user = await linkedUser(msg.from.id);
    if (!user) return reply('I don\'t know you yet. Link your account first: on the website, open your name (bottom left) → <b>Link Telegram</b>.');

    try {
      let text;
      if (cmd === 'status') text = await cmdStatus(user, words, asUser);
      else if (STATUS_WORDS[cmd]) text = await cmdSetStatus(user, STATUS_WORDS[cmd], words, asUser);
      else if (cmd === 'incident') text = await cmdIncident(user, words, asUser);
      else if (cmd === 'update') text = await cmdWorkUpdate(user, words, asUser);
      else if (cmd === 'done') text = await cmdWorkUpdate(user, words, asUser, 'completed');
      else if (cmd === 'work') text = await cmdWork(user, words, asUser);
      else if (cmd === 'summary') text = await summaryText(asUser);
      else if (cmd === 'alerts') text = await cmdAlerts(user, words, chat);
      else if (cmd === 'unlink') {
        await db.tx(user.id, (t) => t.query('update users set telegram_user_id = null, telegram_name = null where id = $1', [user.id]));
        text = 'Unlinked. I won\'t accept reports from this Telegram account any more.';
      } else if (chat.type === 'private') text = 'I don\'t know that command. Send /help.';
      if (text) await reply(text);
    } catch (err) {
      log.error({ err: { message: err.message, stack: err.stack }, cmd }, 'telegram command failed');
      await reply('Sorry, something went wrong. Please try again or use the website.');
    }
  }

  function verifyWebhook(header) {
    if (!token || !header) return false;
    const a = Buffer.from(String(header));
    const b = Buffer.from(webhookSecret(token));
    return a.length === b.length && timingSafeEqual(a, b);
  }

  return {
    enabled: !!token, alert, daily, summaryText, createLinkCode, connect, status, handleUpdate, verifyWebhook, botInfo,
    link, esc,
  };
}
