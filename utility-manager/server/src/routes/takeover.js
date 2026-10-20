// The national takeover tracker: every inhabited island's electricity,
// water and sewerage moving from FENAKA to STELCO (migration 053). Everyone
// can see it; managers and administrators keep it up to date.
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { badRequest } from '../errors.js';
import { date, id, one, optText, parse, parsePatch, serialParam, text, updateSet } from '../http.js';
import { INHABITED_ISLANDS, NATIONAL_ATOLLS } from '../nationalAtolls.js';

export const TAKEOVER_SERVICES = ['electricity', 'water', 'sewerage'];
// Who runs each service: STELCO (taken over), still FENAKA, another
// operator (MWSC, a private party), or no such service on the island yet
// (migration 061). The survey before the takeover is the island's (059).
export const TAKEOVER_STATUSES = ['taken_over', 'fenaka', 'other_operator', 'no_service'];
export const SURVEY_STAGES = ['planned', 'ongoing', 'completed'];
const OUTSIDE = ['no_service', 'other_operator'];
const status = z.enum(TAKEOVER_STATUSES).nullish();
// Every island has electricity.
const noServiceElectricity = 'every island has electricity: no service yet is for water and sewerage';
const electricityStatus = status.refine((s) => s !== 'no_service', noServiceElectricity);
const m365 = z.string().trim().max(2000).url().refine((u) => u.startsWith('https://'), 'must start with https://');
const islandBody = z.object({
  atoll_code: z.enum(NATIONAL_ATOLLS.map((a) => a.code)),
  name: text(100),
  island_id: id.nullish(),
  phase: optText(100),
  electricity_status: electricityStatus, electricity_on: date.nullish(),
  water_status: status, water_on: date.nullish(),
  sewerage_status: status, sewerage_on: date.nullish(),
  notes: optText(2000),
  survey_stage: z.enum(SURVEY_STAGES).nullish(),
  survey_start: date.nullish(), survey_end: date.nullish(),
  survey_team: optText(300),
  survey_link: m365.nullish().or(z.literal('').transform(() => null)),
});
const COLS = ['atoll_code', 'name', 'island_id', 'phase', 'electricity_status', 'electricity_on', 'water_status', 'water_on',
  'sewerage_status', 'sewerage_on', 'notes', 'survey_stage', 'survey_start', 'survey_end', 'survey_team', 'survey_link'];

// Islands still (partly) FENAKA's are the ones to survey; by stage.
const surveyed = (list) => {
  const scope = list.filter((i) => i.state === 'pending');
  const n = (stage) => scope.filter((i) => (i.survey_stage || null) === stage).length;
  return { scope: scope.length, completed: n('completed'), ongoing: n('ongoing'), planned: n('planned'), not_started: n(null) };
};

// An island's overall state: taken over once every service that is part of
// the takeover is; pending (under FENAKA) while any is still FENAKA's; other
// when another operator runs it all; not set when nothing is recorded.
export function islandState(i) {
  const all = TAKEOVER_SERVICES.map((k) => i[`${k}_status`]);
  const s = all.filter((x) => x && !OUTSIDE.includes(x));
  if (!s.length) return all.includes('other_operator') ? 'other' : 'not_set';
  return s.every((x) => x === 'taken_over') ? 'taken_over' : 'pending';
}

const SELECT = `
  select t.*, i.name as srd_island_name, u.full_name as updated_by_name
    from takeover_islands t left join islands i on i.id = t.island_id left join users u on u.id = t.updated_by`;

export default async function takeoverRoutes(app) {
  const { db } = app;
  const manager = { preHandler: requireRole('manager') };

  app.get('/takeover', async () => {
    const { rows } = await db.query(`${SELECT} order by t.atoll_code, t.name`);
    const islands = rows.map((i) => ({ ...i, state: islandState(i) }));
    // Islands outside the census's 187 (counted = false) are on the list and
    // the map, but not in the counts.
    const counted = islands.filter((i) => i.counted !== false);
    const count = (list, state) => list.filter((i) => i.state === state).length;
    const atolls = NATIONAL_ATOLLS.map((a) => {
      const list = counted.filter((i) => i.atoll_code === a.code);
      return { ...a, islands: list.length, taken_over: count(list, 'taken_over'), pending: count(list, 'pending'), other: count(list, 'other'),
        not_set: count(list, 'not_set'), survey: surveyed(list) };
    });
    const services = Object.fromEntries(TAKEOVER_SERVICES.map((k) => [k, {
      taken_over: counted.filter((i) => i[`${k}_status`] === 'taken_over').length,
      fenaka: counted.filter((i) => i[`${k}_status`] === 'fenaka').length,
    }]));
    return {
      expected_islands: INHABITED_ISLANDS,
      totals: {
        islands: counted.length, taken_over: count(counted, 'taken_over'), pending: count(counted, 'pending'),
        other: count(counted, 'other'), not_set: count(counted, 'not_set'),
      },
      survey: surveyed(counted),
      services, atolls, islands,
    };
  });

  app.post('/takeover/islands', manager, async (req, reply) => {
    const b = parse(islandBody, req.body);
    const exists = (await db.query('select 1 from takeover_islands where atoll_code = $1 and lower(name) = lower($2)', [b.atoll_code, b.name])).rows.length;
    if (exists) throw badRequest(`${b.atoll_code}. ${b.name} is already on the list`);
    const cols = COLS.filter((k) => b[k] !== undefined);
    const { rows } = await db.tx(req.user.id, (t) => t.query(
      `insert into takeover_islands (${cols.join(', ')}, updated_by) values (${cols.map((_, i) => `$${i + 1}`).join(', ')}, $${cols.length + 1}) returning id`,
      [...cols.map((k) => b[k]), req.user.id]));
    reply.code(201);
    const row = one((await db.query(`${SELECT} where t.id = $1`, [rows[0].id])).rows);
    return { ...row, state: islandState(row) };
  });

  app.patch('/takeover/islands/:id', manager, async (req) => {
    const { id: rowId } = parse(serialParam, req.params);
    const patch = parsePatch(islandBody.partial(), req.body);
    const set = updateSet({ ...patch, updated_by: req.user.id }, [...COLS, 'updated_by']);
    await db.tx(req.user.id, (t) => t.query(`update takeover_islands set ${set.sql} where id = $1`, [rowId, ...set.values]));
    const row = one((await db.query(`${SELECT} where t.id = $1`, [rowId])).rows, 'Island');
    return { ...row, state: islandState(row) };
  });

  // One service for a whole atoll at once (e.g. "Seenu: electricity taken
  // over"), for the islands not set yet unless all are asked for.
  app.post('/takeover/atolls/:code', manager, async (req) => {
    const { code } = parse(z.object({ code: z.enum(NATIONAL_ATOLLS.map((a) => a.code)) }), req.params);
    const b = parse(z.object({
      service: z.enum(TAKEOVER_SERVICES), status: z.enum(TAKEOVER_STATUSES),
      on: date.nullish(), all: z.boolean().default(false),
    }).refine((x) => !(x.service === 'electricity' && x.status === 'no_service'), noServiceElectricity), req.body);
    const { rowCount } = await db.tx(req.user.id, (t) => t.query(
      `update takeover_islands set ${b.service}_status = $2, ${b.service}_on = $3, updated_by = $4
        where atoll_code = $1 ${b.all ? '' : `and ${b.service}_status is null`}`,
      [code, b.status, b.status === 'taken_over' ? b.on ?? null : null, req.user.id]));
    return { ok: true, updated: rowCount };
  });

  // The survey stage for an atoll's islands still with FENAKA (those with no
  // stage yet, unless all), e.g. "Thaa: survey planned from 1 Nov".
  app.post('/takeover/atolls/:code/survey', manager, async (req) => {
    const { code } = parse(z.object({ code: z.enum(NATIONAL_ATOLLS.map((a) => a.code)) }), req.params);
    const b = parse(z.object({
      stage: z.enum(SURVEY_STAGES).nullable(), start: date.nullish(), end: date.nullish(),
      team: optText(300), all: z.boolean().default(false),
    }), req.body);
    const { rowCount } = await db.tx(req.user.id, (t) => t.query(
      `update takeover_islands set survey_stage = $2, survey_start = coalesce($3, survey_start), survey_end = $4,
              survey_team = coalesce($5, survey_team), updated_by = $6
        where atoll_code = $1 and 'fenaka' in (electricity_status, water_status, sewerage_status)
          ${b.all ? '' : 'and survey_stage is null'}`,
      [code, b.stage, b.start ?? null, b.stage === 'completed' ? b.end ?? null : null, b.team ?? null, req.user.id]));
    return { ok: true, updated: rowCount };
  });

  app.delete('/takeover/islands/:id', { preHandler: requireRole('admin') }, async (req) => {
    const { id: rowId } = parse(serialParam, req.params);
    const { rowCount } = await db.tx(req.user.id, (t) => t.query('delete from takeover_islands where id = $1', [rowId]));
    if (!rowCount) throw badRequest('Not on the list');
    return { ok: true };
  });
}
