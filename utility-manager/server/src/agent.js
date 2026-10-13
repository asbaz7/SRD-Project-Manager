// Telegram assistant: plain-language messages answered by Claude.
//
// Claude looks things up through tools that call the API as the person
// asking (asUser), so the website's rules apply unchanged: technical access,
// island scope, roles. Changes (genset status, work updates, incidents, new
// work) are never made directly: the tool call becomes a pending change that
// the person confirms with ✅ or cancels with ❌, and only then is it written.
//
// Configuration: the ANTHROPIC_API_KEY secret, and optionally AGENT_MODEL
// (default Claude Haiku 5.5). Without a key the assistant is off.
import { randomBytes } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { ATOLL_NAMES, matchIsland } from './reportImport.js';

const MAX_STEPS = 8;
// A conversation starts afresh after this long without a message, or once it
// grows long. Look-up results are kept only for the question they answered:
// once it's answered they shrink to a stub (see save), or every later
// question would resend them all (one chat reached 111,000 characters and
// the API refused it).
const QUIET_HOURS = 3;
const KEEP_RESULT_CHARS = 300;
const MAX_MESSAGES = 60;
const PENDING_TTL_MS = 60 * 60 * 1000;
const RESULT_LIMIT = 40000;

const ASSET_LABELS = {
  genset: 'Genset', solar_inverter: 'Solar inverter', battery: 'Battery', transformer: 'Transformer',
  ro_unit: 'RO unit', pump: 'Pump', blower: 'Blower', tank: 'Tank', other: '',
};
const STATE_LABEL = {
  planned: 'Planned', in_progress: 'In progress', awaiting_parts: 'Awaiting parts', on_hold: 'On hold',
  completed: 'Completed', cancelled: 'Cancelled', dismantling: 'Dismantling', in_transit: 'In transit', installing: 'Installing',
};
const WORK_STATES = Object.keys(STATE_LABEL);
const WORK_KINDS = ['overhaul', 'top_overhaul', 'alternator_service', 'repair', 'service', 'inspection', 'installation', 'other'];
const SERVICES = ['electricity', 'water', 'sewerage'];

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const ref = (id) => `WO-${String(id).padStart(4, '0')}`;
const assetLabel = (a) => `${a.atoll_code}. ${a.island_name} ${`${ASSET_LABELS[a.kind] ?? ''} ${a.tag}`.trim()}`;

const SYSTEM = `You are the SRD Utility assistant on Telegram, for the head office of STELCO's South Regional Department (SRD) in the Maldives. SRD runs electricity (powerhouses with diesel gensets, plus solar and batteries), water (RO plants) and sewerage on islands across several atolls. Staff message you to look things up and to record what is happening in the field.

How to work:
- Look things up with the tools. Never guess figures, names, statuses or dates. If a tool returns an error or nothing, say so plainly.
- Islands are written with their atoll code, like "ADh. Fenfushi" or "K. Maafushi". Use find_island to turn a name into an id; if several islands match, ask which one.
- Gensets are called "Genset 2", "G2" or "engine 2". Each powerhouse files a monthly condition report per genset (condition, running hours, faults); get_island and list_engines include the latest one.
- Work orders (WO-0001, WO-0002…; the number is the work_id) are jobs on equipment: repairs, overhauls, services, genset moves. Use list_work / get_work for them.
- Projects (PRJ-0001, PRJ-0002…; the number is the project_id) are separate from work orders: larger efforts such as installations, studies or the Powerhouse Takeover, with a progress % and often a task list (codes like TKO-001, priorities P1-P4). When someone asks about projects, use list_projects / get_project, never the work tools; when they ask about works, jobs or repairs, use list_work.
- To record anything (a genset's status, an update on work, an interruption, new work), call the matching tool. The person is then shown exactly what will be written and taps ✅ or ❌, so don't ask "shall I?" first. Do ask first when it's unclear which island, genset or work order they mean.
- Only propose one change at a time.
- The person's access is enforced by the system: if a tool says something isn't allowed, tell them it needs other access or the website.
- If the tools can't do what's asked, say so and point them to the website.
- Messages may mix English and Dhivehi; answer in English.

Style: this is a chat on a phone. Answer in a few short lines with the answer first and no preamble. Plain text: **bold** sparingly for names and key figures, short "•" lists are fine, no tables or headings. Refer to work by its WO number and projects by their PRJ number. Genset power is in kW.`;

// ---- Tools ------------------------------------------------------------------
const id = z.string().uuid();
const atoll = z.string().max(40).optional().describe('Atoll code or name, e.g. "Dh" or "Dhaalu"');
const workId = z.number().int().positive().describe('The number of the work order: 12 for WO-0012');

function query(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

// API results without empty fields, and capped: tool results go back to Claude on every step.
function compact(value) {
  const json = JSON.stringify(value, (k, v) => (v === null || v === '' || (Array.isArray(v) && !v.length) || k === 'total_count' ? undefined : v));
  return json.length > RESULT_LIMIT ? `${json.slice(0, RESULT_LIMIT)}… (cut short: ask for something narrower)` : json;
}

class ToolError extends Error {}
function check(res, ok = [200]) {
  if (ok.includes(res.status)) return res.body;
  if (res.status === 403) throw new ToolError(`Not allowed: ${res.body?.error || 'this needs other access'}`);
  if (res.status === 404) throw new ToolError(res.body?.error || 'Not found');
  throw new ToolError(res.body?.error || `The request failed (${res.status})`);
}

function buildTools(db) {
  const islands = async () => (await db.query(
    'select i.id, i.name, a.code as atoll_code from islands i join atolls a on a.id = i.atoll_id where i.active order by a.code, i.name')).rows;
  const islandName = async (islandId) => {
    const i = (await islands()).find((x) => x.id === islandId);
    if (!i) throw new ToolError('No such island: use find_island for the id');
    return `${i.atoll_code}. ${i.name}`;
  };
  const get = (asUser, user, path) => asUser(user.id, 'GET', path).then((r) => check(r));
  // "Dh", "Dhaalu", "dh atoll" → the atoll's id.
  const atollId = async (text) => {
    if (!text) return undefined;
    const letters = (v) => String(v || '').toUpperCase().replace(/ATOLL/g, '').replace(/[^A-Z]/g, '');
    const key = letters(text);
    const list = (await db.query('select id, code, name from atolls order by code')).rows;
    const a = list.find((x) => letters(x.code) === key || letters(x.name) === key || x.code === ATOLL_NAMES[key]);
    if (!a) throw new ToolError(`No atoll "${text}". Atolls: ${list.map((x) => `${x.code} (${x.name})`).join(', ')}`);
    return a.id;
  };
  // A page of results with the total, so Claude knows when it hasn't seen everything.
  const listed = (page, slim = (x) => x) => {
    const items = (page.items || page).map(slim);
    const total = page.total ?? items.length;
    return { total, shown: items.length, ...(total > items.length ? { more: 'Not all shown: narrow it by island, atoll, service or status' } : {}), items };
  };

  return {
    // -- Look things up
    find_island: {
      description: 'Find an island by name (atoll code optional, spelling may be loose). Returns its id, or candidates when the name is ambiguous.',
      schema: z.object({ name: z.string().min(2).describe('e.g. "Fenfushi" or "ADh. Fenfushi"') }),
      run: async (user, { name }) => {
        const r = matchIsland(await islands(), name);
        return r.island ? { island: r.island } : { island: null, candidates: r.candidates };
      },
    },
    get_overview: {
      description: "The region at a glance: gensets running and available capacity, faults, work in progress, open interruptions, what's due. Start here for general questions.",
      schema: z.object({}),
      run: (user, _, asUser) => get(asUser, user, '/dashboard'),
    },
    get_island: {
      description: "One island in full: its plants and their assets (each genset's status, latest condition report, faults, open work), ongoing work with the latest update, and recent condition reports.",
      schema: z.object({ island_id: id }),
      run: (user, { island_id }, asUser) => get(asUser, user, `/islands/${island_id}`),
    },
    list_engines: {
      description: 'Gensets across the region (or one atoll or island) with capacity, status, latest condition report, running hours and what is due. Filter rather than reading the whole region: by status (e.g. all disconnected or down gensets), by condition (e.g. all faults) or by flag (e.g. overdue overhauls).',
      schema: z.object({
        island_id: id.optional(),
        atoll,
        status: z.enum(['running', 'standby', 'down', 'maintenance', 'disconnected', 'unknown']).optional()
          .describe("The genset's status as set on it; disconnected = installed but not connected to the network"),
        condition: z.enum(['ok', 'minor_fault', 'major_fault', 'not_running', 'no_report', 'faults', 'retired']).optional()
          .describe('From the condition reports. faults = minor, major or not running'),
        flag: z.enum(['overhaul', 'alternator', 'work', 'stale']).optional()
          .describe('overhaul / alternator = service due; work = has open work; stale = report out of date'),
        q: z.string().max(100).optional().describe('Text search: tag, model, serial, island or fault'),
      }),
      run: async (user, { atoll: a, ...input }, asUser) => {
        const d = await get(asUser, user, `/engines${query({ ...input, atoll_id: await atollId(a) })}`);
        // Long lists (the whole region is ~280 gensets): one short line each,
        // so all of them fit; get_island / get_asset have the rest.
        if (d.engines.length > 60) {
          return { today: d.today, summary: d.summary, note: 'Short form: island, genset, kW, status, condition, open work. Filter or use get_island for more.',
            engines: d.engines.map((e) => [`${e.atoll_code}. ${e.island_name} ${e.tag}`, `${e.rated_capacity ?? '?'} kW`, e.status,
              e.condition || 'no report', e.overhaul_due && 'overhaul due', ...e.open_work.map((w) => `WO-${String(w.id).padStart(4, '0')}`)].filter(Boolean).join(' · ')) };
        }
        // One line's worth per genset: get_asset has the rest.
        return { today: d.today, summary: d.summary, engines: d.engines.map((e) => ({
          asset_id: e.id, genset: `${e.atoll_code}. ${e.island_name} ${e.tag}`, model: e.make_model, kw: e.rated_capacity,
          operating_kw: e.operating_capacity !== e.rated_capacity ? e.operating_capacity : undefined, status: e.status,
          condition: e.condition, report_month: e.report_month, report_stale: e.report_stale || undefined,
          fault: (e.condition_source === 'status' ? e.condition_note : e.fault || e.status_text)?.slice(0, 120),
          total_hours: e.total_hours, hours_to_overhaul: e.hours_to_overhaul, overhaul_due: e.overhaul_due || undefined,
          alt_service_due: e.alt_service_due || undefined,
          open_work: e.open_work.map((w) => `WO-${String(w.id).padStart(4, '0')} ${w.title} (${w.status})`),
        })) };
      },
    },
    get_asset: {
      description: 'One asset (genset, RO unit, pump...) in full, with its status history, maintenance and work.',
      schema: z.object({ asset_id: id }),
      run: (user, { asset_id }, asUser) => get(asUser, user, `/assets/${asset_id}`),
    },
    list_work: {
      description: 'Work orders, ongoing by default, most active first. Each item is a summary: use get_work for the full description and all updates.',
      schema: z.object({
        status: z.enum(['open', 'all', ...WORK_STATES]).optional().describe('open (default) = not completed or cancelled'),
        island_id: id.optional(),
        atoll,
        asset_id: id.optional(),
        service: z.enum(SERVICES).optional(),
        assignee: z.literal('me').optional().describe('Only work assigned to the person asking'),
        unit: z.literal('mine').optional().describe("Only work assigned to the asking person's unit"),
        q: z.string().max(100).optional(),
      }),
      run: async (user, { atoll: a, ...input }, asUser) => listed(
        await get(asUser, user, `/work${query({ ...input, atoll_id: await atollId(a), limit: 100 })}`),
        (w) => ({
          ref: w.ref, island: `${w.atoll_code}. ${w.island_name}`, title: w.title, status: w.status, service: w.service, kind: w.kind,
          asset: w.asset_tag && `${w.asset_kind} ${w.asset_tag}`, unit: w.unit_name, assigned: [w.assigned_user_name, w.assigned_to].filter(Boolean).join(' · '),
          target_on: w.target_on, overdue: w.overdue || undefined, fault_ref: w.external_ref,
          last_update: w.last_update && w.last_update.slice(0, 160), last_update_at: w.last_update_at && String(w.last_update_at).slice(0, 10),
        })),
    },
    get_work: {
      description: 'One work order in full, with all its updates.',
      schema: z.object({ work_id: workId }),
      run: (user, { work_id }, asUser) => get(asUser, user, `/work/${work_id}`),
    },
    list_projects: {
      description: 'Projects (not work orders), active ones by default: planned, ongoing or on hold. Each item is a summary: use get_project for its tasks and updates.',
      schema: z.object({
        status: z.enum(['active', 'planned', 'ongoing', 'on_hold', 'completed', 'cancelled']).optional().describe('active (default) = planned, ongoing or on hold'),
        island_id: id.optional(),
        atoll,
        q: z.string().max(100).optional().describe('Text search: title, contractor or island'),
      }),
      run: async (user, { atoll: a, status, ...input }, asUser) => listed(
        await get(asUser, user, `/projects${query({ ...input, status: status || 'active', atoll_id: await atollId(a), limit: 100 })}`),
        (p) => ({
          ref: p.ref, project_id: p.id, title: p.title, where: p.island_name ? `${p.atoll_code}. ${p.island_name}` : 'Regional',
          type: p.project_type, status: p.status, progress_pct: Number(p.progress_pct), unit: p.unit_name, owner: p.owner_name,
          start_date: p.start_date, target_date: p.target_date, overdue: p.overdue || undefined,
          last_update_at: p.last_update_at && String(p.last_update_at).slice(0, 10),
        })),
    },
    get_project: {
      description: 'One project in full: details, its tasks (for a tracker such as the Powerhouse Takeover: code, priority, status, progress, due date, who and remarks), the latest updates, and per-site access and checklist progress.',
      schema: z.object({ project_id: z.number().int().positive().describe('The number of the project: 13 for PRJ-0013') }),
      run: async (user, { project_id }, asUser) => {
        const p = await get(asUser, user, `/projects/${project_id}`);
        const open = (t) => !['Completed', 'Cancelled'].includes(t.status);
        return {
          ref: p.ref, title: p.title, status: p.status, progress_pct: Number(p.progress_pct), where: p.island_name ? `${p.atoll_code}. ${p.island_name}` : 'Regional',
          type: p.project_type, unit: p.unit_name, owner: p.owner_name, contractor: p.contractor, budget: p.budget,
          start_date: p.start_date, target_date: p.target_date, overdue: p.overdue || undefined, scope: p.description?.slice(0, 600),
          can_edit: p.can_edit,
          tasks: p.tasks.map((t) => (p.tracker ? {
            code: t.code, task: t.name, priority: t.priority && `P${t.priority}`, status: t.status, progress: Number(t.progress),
            dept: t.responsible_dept, site: t.island_name && `${t.atoll_code}. ${t.island_name}`,
            assigned: [t.assigned_user_name, t.assigned_to].filter(Boolean).join(' · ') || undefined,
            due: t.due_date, overdue: (t.overdue && open(t)) || undefined, completed: t.completed_date, remarks: t.remarks?.slice(0, 160),
          } : { task: t.name, progress: Number(t.progress) })),
          sites: p.sites?.length ? p.sites.map((x) => ({
            site: `${x.atoll_code}. ${x.island_name}`, access: `${x.access_granted}/${x.access_total} granted`,
            checklist: `${x.checklist_checked}/${x.checklist_total} checked`, not_available: x.checklist_missing || undefined,
          })) : undefined,
          updates: p.updates.slice(0, 5).map((u) => ({ at: String(u.created_at).slice(0, 10), by: u.created_by_name, text: u.body.slice(0, 300) })),
        };
      },
    },
    list_incidents: {
      description: 'Interruptions (outages, breakdowns, safety...), newest first.',
      schema: z.object({
        status: z.enum(['open', 'resolved', 'closed']).optional(),
        island_id: id.optional(),
        atoll,
        service: z.enum(SERVICES).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
      }),
      run: async (user, { atoll: a, ...input }, asUser) => listed(await get(asUser, user, `/incidents${query({ ...input, atoll_id: await atollId(a), limit: 50 })}`)),
    },

    // -- Changes: describe() says what will be written; run() writes it once confirmed.
    set_asset_status: {
      write: true,
      description: "Record an asset's status (e.g. a genset going down or back up). The person confirms before it's saved. A note is required when it goes down.",
      schema: z.object({
        asset_id: id,
        status: z.enum(['running', 'standby', 'down', 'maintenance', 'disconnected']).describe('disconnected = installed but not connected to the network: not a fault'),
        note: z.string().max(1000).optional().describe('What happened, in their words'),
      }),
      describe: async (user, { asset_id, status, note }, asUser) => {
        if (status === 'down' && !note) throw new ToolError('Ask what is wrong first: a note is required when it goes down');
        const a = await get(asUser, user, `/assets/${asset_id}`);
        return `Set <b>${esc(assetLabel(a))}</b> to <b>${status}</b>${note ? `: ${esc(note)}` : ''}`;
      },
      run: async (user, { asset_id, status, note }, asUser) => {
        const body = check(await asUser(user.id, 'POST', '/assets/status', { items: [{ asset_id, status, note: note || null }] }));
        const w = body.work?.[0];
        return { text: `Status saved: <b>${status}</b>${w ? ` · work ${esc(w.ref)} opened` : ''}`, result: { saved: true, status, work: w?.ref } };
      },
    },
    add_work_update: {
      write: true,
      description: "Post an update on a work order, optionally moving it to a new state (e.g. completed). The person confirms before it's posted.",
      schema: z.object({
        work_id: workId,
        text: z.string().min(1).max(5000).describe('The update, in their words'),
        status: z.enum(WORK_STATES).optional().describe('Only when they say the state changed'),
      }),
      describe: async (user, { work_id, text, status }, asUser) => {
        const w = await get(asUser, user, `/work/${work_id}`);
        return `Add an update to <b>${ref(work_id)}</b> ${esc(w.title)}:\n<i>${esc(text)}</i>${status ? `\nStatus → <b>${STATE_LABEL[status]}</b>` : ''}`;
      },
      run: async (user, { work_id, text, status }, asUser) => {
        const body = check(await asUser(user.id, 'POST', `/work/${work_id}/updates`, { body: text, status: status || null }), [201]);
        const now = status || body?.auto_status;
        return { text: `Update posted to <b>${ref(work_id)}</b>${now ? ` · status <b>${STATE_LABEL[now]}</b>` : ''}`, result: { posted: true, status: now } };
      },
    },
    report_incident: {
      write: true,
      description: "Report an interruption: an outage, breakdown, safety or quality problem. The person confirms before it's reported.",
      schema: z.object({
        island_id: id,
        service: z.enum(SERVICES),
        category: z.enum(['outage', 'breakdown', 'maintenance', 'quality', 'safety', 'other']),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        title: z.string().min(3).max(200),
        description: z.string().max(5000).optional(),
        asset_id: id.optional(),
      }),
      describe: async (user, x) => `Report an interruption at <b>${esc(await islandName(x.island_id))}</b>: ${esc(x.title)}\n${x.service} · ${x.category} · ${x.severity}`,
      run: async (user, x, asUser) => {
        const body = check(await asUser(user.id, 'POST', '/incidents', { ...x, started_at: new Date().toISOString() }), [201]);
        return { text: `Interruption <b>${esc(body.ref)}</b> reported`, result: { ref: body.ref } };
      },
    },
    create_work: {
      write: true,
      description: "Log new work (a repair, service, overhaul...) on an asset, or island-wide with a service. The person confirms before it's created.",
      schema: z.object({
        asset_id: id.optional().describe('The asset worked on, when there is one'),
        island_id: id.optional().describe('For island-wide work without an asset'),
        service: z.enum(SERVICES).optional().describe('Needed for island-wide work'),
        kind: z.enum(WORK_KINDS),
        title: z.string().min(3).max(200),
        description: z.string().max(5000).optional(),
        status: z.enum(['planned', 'in_progress', 'awaiting_parts', 'on_hold']).optional().describe('Default in progress'),
      }),
      describe: async (user, x, asUser) => {
        if (!x.asset_id && !(x.island_id && x.service)) throw new ToolError('Give asset_id, or island_id and service');
        const where = x.asset_id ? assetLabel(await get(asUser, user, `/assets/${x.asset_id}`)) : `${await islandName(x.island_id)} (${x.service})`;
        return `Log new work on <b>${esc(where)}</b>: ${esc(x.title)}\n${x.kind.replace('_', ' ')} · ${STATE_LABEL[x.status || 'in_progress']}`;
      },
      run: async (user, x, asUser) => {
        const body = check(await asUser(user.id, 'POST', '/work', x), [201]);
        return { text: `Work <b>${esc(body.ref)}</b> logged`, result: { ref: body.ref, work_id: body.id } };
      },
    },
  };
}

function toolDefs(tools) {
  return Object.entries(tools).map(([name, t]) => {
    const { $schema, ...input_schema } = z.toJSONSchema(t.schema);
    return { name, description: t.description, input_schema };
  });
}

// Claude's reply as Telegram HTML: escaped, with **bold** kept.
export function toTelegram(text) {
  const html = esc(text.trim()).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/^#{1,6}\s+/gm, '');
  return html.length > 3900 ? `${html.slice(0, 3900)}…` : html;
}

export function createAgent({ db, config, log }) {
  const key = config.anthropicKey;
  if (!key) return null;
  const model = config.agentModel || 'claude-haiku-5-5';
  // fetch looked up on each call, so tests can stand in for the API.
  const client = new Anthropic({ apiKey: key, timeout: 60_000, fetch: (url, init) => globalThis.fetch(url, init) });
  const tools = buildTools(db);
  const defs = toolDefs(tools);

  async function load(chatId, userId) {
    const { rows } = await db.query(
      `select messages, pending, updated_at < now() - make_interval(hours => $3) as stale
         from telegram_conversations where chat_id = $1 and user_id = $2`, [chatId, userId, QUIET_HOURS]);
    const row = rows[0];
    if (!row || row.stale || row.messages.length > MAX_MESSAGES) return { chatId, userId, messages: [], pending: null };
    return { chatId, userId, messages: tidy(row.messages), pending: row.pending };
  }

  // Once a question is answered, its look-up results shrink to a stub and
  // Claude's thinking is dropped: a thinking block is only valid with the
  // exact tools and earlier messages it was made with, so after a shrink or
  // a deploy it would be refused ("bound to a different conversation"), and
  // past turns' thinking isn't used anyway. While a change waits for ✅ the
  // history is left exactly as it is, since that turn isn't finished.
  const tidy = (messages) => {
    const last = messages.at(-1);
    if (last?.role === 'assistant' && Array.isArray(last.content) && last.content.some((b) => b.type === 'tool_use')) return messages;
    return messages.map((m) => {
      if (!Array.isArray(m.content)) return m;
      if (m.role === 'assistant') return { ...m, content: m.content.filter((b) => b.type !== 'thinking' && b.type !== 'redacted_thinking') };
      return {
        ...m,
        content: m.content.map((b) => (b.type === 'tool_result' && typeof b.content === 'string' && b.content.length > KEEP_RESULT_CHARS
          ? { ...b, content: `${b.content.slice(0, KEEP_RESULT_CHARS)}… (earlier result, shortened: look it up again for current figures)` } : b)),
      };
    }).filter((m) => !Array.isArray(m.content) || m.content.length);
  };
  const save = (c) => db.query(
    `insert into telegram_conversations (chat_id, user_id, messages, pending, updated_at) values ($1, $2, $3, $4, now())
     on conflict (chat_id, user_id) do update set messages = excluded.messages, pending = excluded.pending, updated_at = now()`,
    [c.chatId, c.userId, JSON.stringify(tidy(c.messages)), c.pending ? JSON.stringify(c.pending) : null]);

  const result = (toolUseId, content, isError = false) => ({
    type: 'tool_result', tool_use_id: toolUseId, content: typeof content === 'string' ? content : compact(content), ...(isError ? { is_error: true } : {}),
  });

  function context(user) {
    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: config.timezone });
    const access = user.technical ? 'technical staff' : 'non-technical staff: gensets, plants and condition reports are not available to them';
    return `Today is ${today}. You are talking to ${user.full_name} (${user.role}, ${access}).`;
  }

  // Claude's turns until it answers, or proposes a change to confirm.
  async function run(conv, user, asUser) {
    for (let step = 0; step < MAX_STEPS; step++) {
      const res = await client.messages.create({
        model,
        max_tokens: 8000,
        output_config: { effort: 'low' }, // lookups and short answers: low keeps replies quick
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }, { type: 'text', text: context(user) }],
        tools: defs,
        messages: conv.messages,
      });
      const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      const uses = res.content.filter((b) => b.type === 'tool_use');
      if (res.stop_reason === 'refusal') return { text: "Sorry, I can't help with that one." };
      // A tool call cut off at the length limit is never run (nor kept: it would have no result).
      if (res.stop_reason !== 'tool_use' || !uses.length) {
        if (!uses.length) conv.messages.push({ role: 'assistant', content: res.content });
        return { text: text || 'Sorry, I lost my train of thought. Please ask again.' };
      }
      conv.messages.push({ role: 'assistant', content: res.content });

      // Look-ups asked for together run together; a change is only described here.
      const caught = (p, id) => p.catch((err) => { if (!(err instanceof ToolError)) throw err; return result(id, err.message, true); });
      const slots = [];
      let pending = null;
      for (const use of uses) {
        const tool = tools[use.name];
        const input = tool?.schema.safeParse(use.input);
        if (!tool) slots.push(result(use.id, `No tool called ${use.name}`, true));
        else if (!input.success) slots.push(result(use.id, `Invalid input: ${z.prettifyError(input.error)}`, true));
        else if (tool.write && pending) slots.push(result(use.id, 'One change at a time: propose this again once the first is confirmed or cancelled.', true));
        else if (tool.write) {
          const summary = await caught(Promise.resolve().then(() => tool.describe(user, input.data, asUser)).then((text) => ({ text })), use.id);
          if (summary.text !== undefined) pending = { id: randomBytes(6).toString('hex'), tool_use_id: use.id, name: use.name, input: input.data, summary: summary.text, at: Date.now() };
          else slots.push(summary);
        } else slots.push(caught(Promise.resolve().then(() => tool.run(user, input.data, asUser)).then((out) => result(use.id, out)), use.id));
      }
      const results = await Promise.all(slots);
      if (pending) {
        // The other results wait with it: they go back together once the person answers.
        conv.pending = { ...pending, results };
        return { text, confirm: { id: pending.id, summary: pending.summary } };
      }
      conv.messages.push({ role: 'user', content: results });
    }
    return { text: 'That took too many steps. Try asking for something narrower.' };
  }

  // A message from a linked person. Returns { text, confirm? }.
  async function reply(chatId, user, text, asUser) {
    const conv = await load(chatId, user.id);
    const content = [];
    if (conv.pending) {
      // They wrote instead of tapping: the proposed change lapses.
      content.push(...conv.pending.results, result(conv.pending.tool_use_id, 'Not confirmed: the person sent a new message instead. Nothing was changed.', true));
      conv.pending = null;
    }
    content.push({ type: 'text', text });
    conv.messages.push({ role: 'user', content });
    const out = await run(conv, user, asUser);
    await save(conv);
    log.info({ chatId, user: user.id, steps: conv.messages.length, confirm: !!out.confirm }, 'telegram assistant replied');
    return out;
  }

  // ✅ or ❌ on a proposed change. Returns the text to show, or null when
  // there is nothing (any more) to confirm.
  async function confirm(chatId, user, pendingId, approve, asUser) {
    const conv = await load(chatId, user.id);
    const p = conv.pending;
    if (!p || p.id !== pendingId) return null;
    conv.pending = null;
    let text;
    let outcome;
    if (Date.now() - p.at > PENDING_TTL_MS) {
      text = 'That was over an hour ago, so I didn\'t save it. Ask me again if it still applies.';
      outcome = result(p.tool_use_id, 'Expired before it was confirmed. Nothing was changed.', true);
    } else if (!approve) {
      text = '❌ Cancelled. Nothing was changed.';
      outcome = result(p.tool_use_id, 'The person tapped ❌: nothing was changed.', true);
    } else {
      try {
        const r = await tools[p.name].run(user, p.input, asUser);
        text = `✅ ${r.text}`;
        outcome = result(p.tool_use_id, { confirmed: true, ...r.result });
      } catch (err) {
        if (!(err instanceof ToolError)) throw err;
        text = `⚠️ Not saved: ${esc(err.message)}`;
        outcome = result(p.tool_use_id, `Confirmed, but it failed: ${err.message}`, true);
      }
    }
    conv.messages.push({ role: 'user', content: [...p.results, outcome] });
    await save(conv);
    return text;
  }

  return { model, reply, confirm };
}
