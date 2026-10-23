import { z } from 'zod';
import { assertIslandWrite, requireAllowed } from '../auth.js';
import { sendCsv } from '../csv.js';
import { badRequest, forbidden, notFound } from '../errors.js';
import { refSql } from '../format.js';
import { editUpdate } from './work.js';
import { date, id, one, optText, pageOf, paging, parse, parsePatch, serialParam, service, text, unitId, updateSet, Where } from '../http.js';
import trackerRoutes, { loadSites, loadTasks } from './projectTracker.js';
import { linkRoutes, loadLinks } from '../links.js';

const STATES = ['planned', 'ongoing', 'on_hold', 'completed', 'cancelled'];

export const PROJECT_TYPES = ['mechanical', 'electrical', 'infrastructure', 'office_cs', 'maintenance', 'store', 'workshop', 'staff_area'];
const task = z.object({ name: z.string().trim().min(1).max(200), progress: z.number().min(0).max(100).default(0) });

const body = z.object({
  service: service.nullish(),
  project_type: z.enum(PROJECT_TYPES).nullish(),
  // Task breakdown: overall progress is their average (trigger, migration 018).
  tasks: z.array(task).max(100).optional(),
  island_id: id.nullish(),
  facility_id: id.nullish(),
  title: text(200),
  description: optText(5000),
  status: z.enum(STATES).default('planned'),
  progress_pct: z.number().min(0).max(100).default(0),
  budget: z.number().nonnegative().nullish(),
  contractor: optText(200),
  start_date: date.nullish(),
  target_date: date.nullish(),
  completed_on: date.nullish(),
  owner_id: id.nullish(),
  // The unit doing it; its members can view the project.
  unit_id: unitId.nullish(),
  // Who can see it: everyone, or only the people listed (plus the creator,
  // the owner and administrators).
  visibility: z.enum(['everyone', 'members']).optional(),
  members: z.array(z.object({ user_id: id, access: z.enum(['view', 'edit']) })).max(200).optional(),
});
const COLS = ['service', 'project_type', 'facility_id', 'title', 'description', 'status', 'progress_pct', 'budget',
  'contractor', 'start_date', 'target_date', 'completed_on', 'owner_id', 'visibility', 'unit_id'];
const updateBody = z.object({
  body: text(5000),
  progress_pct: z.number().min(0).max(100).nullish(),
  status: z.enum(STATES).nullish(),
});

const listQuery = paging.extend({
  status: z.enum([...STATES, 'active']).optional(), // active = planned, ongoing or on hold
  service: service.optional(),
  type: z.enum(PROJECT_TYPES).optional(),
  island_id: id.optional(),
  atoll_id: id.optional(),
  unit: z.union([unitId, z.literal('mine')]).optional(),
  q: z.string().max(100).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const SELECT = `
  select p.*, ${refSql('PRJ', 'p.id')} as ref,
         i.name as island_name, i.atoll_id, a.code as atoll_code, f.name as facility_name,
         o.full_name as owner_name, un.name as unit_name,
         (p.target_date < current_date and p.status in ('planned', 'ongoing', 'on_hold')) as overdue,
         (select max(created_at) from project_updates u where u.project_id = p.id) as last_update_at,
         count(*) over () as total_count
    from projects p
    left join islands i on i.id = p.island_id
    left join atolls a on a.id = i.atoll_id
    left join facilities f on f.id = p.facility_id
    left join users o on o.id = p.owner_id
    left join units un on un.id = p.unit_id`;

// Regional projects (no island) need region-wide rights to create.
async function assertProjectCreate(db, user, islandId) {
  if (islandId) return assertIslandWrite(db, user, { islandId });
  if (user.role !== 'admin' && !user.scope.region) throw forbidden('Only region-wide users can create regional projects');
}

// SQL condition: the user may see project p. Values start at $n.
export function projectVisible(user, n) {
  if (user.role === 'admin') return { sql: 'true', values: [] };
  return {
    sql: `(p.visibility = 'everyone' or p.created_by = $${n} or p.owner_id = $${n}
           or exists (select 1 from project_members m where m.project_id = p.id and m.user_id = $${n})
           or p.unit_id = (select unit_id from users where id = $${n}))`,
    values: [user.id],
  };
}

// The user's access to one project: null (none), 'view', 'edit' or 'manage'
// (edit, and choose who has access: creator, owner, administrators).
async function accessTo(db, user, projectId) {
  const { rows } = await db.query(`
    select p.visibility, p.created_by, p.owner_id,
           (select access from project_members m where m.project_id = p.id and m.user_id = $2) as member,
           p.unit_id = (select unit_id from users where id = $2) as in_unit
      from projects p where p.id = $1`, [projectId, user.id]);
  const p = one(rows, 'Project');
  if (user.role === 'admin' || p.created_by === user.id || p.owner_id === user.id) return 'manage';
  if (p.member === 'edit') return 'edit';
  if (p.member === 'view' || p.visibility === 'everyone' || p.in_unit) return 'view';
  return null;
}

export async function assertAccess(db, user, projectId, needed) {
  const access = await accessTo(db, user, projectId);
  const rank = { view: 1, edit: 2, manage: 3 };
  if (!access) throw notFound('Project');
  if (rank[access] < rank[needed]) {
    throw forbidden(needed === 'manage' ? 'Only the project creator, its owner or an administrator can change who has access'
      : 'You can view this project but not edit it. Ask its creator for edit access.');
  }
  return access;
}

async function writeTasks(t, projectId, tasks) {
  await t.query('delete from project_tasks where project_id = $1', [projectId]);
  let position = 0;
  for (const k of tasks) {
    await t.query('insert into project_tasks (project_id, position, name, progress) values ($1, $2, $3, $4)',
      [projectId, ++position, k.name, Math.round(k.progress * 10) / 10]);
  }
}

async function writeMembers(t, projectId, members, addedBy) {
  await t.query('delete from project_members where project_id = $1', [projectId]);
  for (const m of members) {
    await t.query(`insert into project_members (project_id, user_id, access, added_by) values ($1, $2, $3, $4)
                   on conflict (project_id, user_id) do update set access = excluded.access`, [projectId, m.user_id, m.access, addedBy]);
  }
}

export default async function projectRoutes(app) {
  await trackerRoutes(app);
  const { db } = app;

  app.get('/projects', async (req, reply) => {
    const q = parse(listQuery, req.query);
    const vis = projectVisible(req.user, 1);
    const w = new Where(vis.values)
      .raw(vis.sql)
      .add('p.service = ?', q.service).add('p.project_type = ?', q.type).add('p.island_id = ?', q.island_id).add('i.atoll_id = ?', q.atoll_id)
      .add(q.unit === 'mine' ? 'p.unit_id = (select unit_id from users where id = ?)' : 'p.unit_id = ?', q.unit === 'mine' ? req.user.id : q.unit)
      .add('(p.title ilike ? or p.contractor ilike ? or i.name ilike ?)', q.q && `%${q.q}%`);
    if (q.status === 'active') w.raw("p.status in ('planned', 'ongoing', 'on_hold')");
    else w.add('p.status = ?', q.status);
    const csv = q.format === 'csv';
    const { rows } = await db.query(`${SELECT} ${w.sql}
      order by array_position(array['ongoing','on_hold','planned','completed','cancelled']::project_state[], p.status),
               p.target_date nulls last, p.id desc
      limit ${csv ? 20000 : q.limit} offset ${csv ? 0 : q.offset}`, w.values);
    if (csv) {
      return sendCsv(reply, 'projects.csv', rows, [
        ['Ref', 'ref'], ['Atoll', 'atoll_code'], ['Island', 'island_name'], ['Type', 'project_type'], ['Service', 'service'],
        ['Title', 'title'], ['Status', 'status'], ['Progress %', 'progress_pct'], ['Budget', 'budget'],
        ['Contractor', 'contractor'], ['Start', 'start_date'], ['Target', 'target_date'],
        ['Completed', 'completed_on'], ['Unit', 'unit_name'], ['Owner', 'owner_name'], ['Description', 'description'],
      ]);
    }
    return pageOf(rows, q);
  });

  app.get('/projects/:id', async (req) => {
    const { id: projectId } = parse(serialParam, req.params);
    const access = await assertAccess(db, req.user, projectId, 'view');
    const project = one((await db.query(`${SELECT} where p.id = $1`, [projectId])).rows, 'Project');
    delete project.total_count;
    project.access = access;
    project.can_edit = access === 'edit' || access === 'manage';
    project.can_manage = access === 'manage';
    // Everything else about it at once.
    const [tasks, sites, links, members, updates] = await Promise.all([
      loadTasks(db, projectId),
      loadSites(db, projectId),
      loadLinks(db, 'project', projectId),
      db.query(`
        select m.user_id, m.access, u.full_name, u.designation from project_members m join users u on u.id = m.user_id
         where m.project_id = $1 order by m.access desc, u.full_name`, [projectId]),
      db.query(`
        select u.*, us.full_name as created_by_name, (u.created_by = $2 and u.created_at > now() - interval '8 hours') as can_edit from project_updates u
          left join users us on us.id = u.created_by
         where u.project_id = $1 order by u.created_at desc`, [projectId, req.user.id]),
    ]);
    project.tasks = tasks;
    // A tracker: tasks with codes, statuses and so on, edited one at a time.
    project.tracker = tasks.some((t) => t.code || t.status);
    project.sites = sites;
    project.links = links;
    project.members = members.rows;
    project.updates = updates.rows;
    return project;
  });

  app.post('/projects', { preHandler: requireAllowed('projects', 'You are not allowed to create projects. Ask an administrator.') }, async (req, reply) => {
    const b = parse(body, req.body);
    await assertProjectCreate(db, req.user, b.island_id);
    const rows = await db.tx(req.user.id, async (t) => {
      const res = await t.query(`
        insert into projects (service, island_id, facility_id, title, description, status, progress_pct, budget,
                              contractor, start_date, target_date, completed_on, owner_id, created_by, visibility, project_type, unit_id)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) returning id`,
      [b.service ?? null, b.island_id ?? null, b.facility_id ?? null, b.title, b.description, b.status, b.progress_pct,
        b.budget ?? null, b.contractor, b.start_date ?? null, b.target_date ?? null, b.completed_on ?? null,
        b.owner_id ?? null, req.user.id, b.visibility ?? 'members', b.project_type ?? null, b.unit_id ?? null]);
      await writeMembers(t, res.rows[0].id, (b.members || []).filter((m) => m.user_id !== req.user.id), req.user.id);
      if (b.tasks?.length) await writeTasks(t, res.rows[0].id, b.tasks);
      return res.rows;
    });
    reply.code(201);
    return one((await db.query(`${SELECT} where p.id = $1`, [rows[0].id])).rows);
  });

  // A cancelled project can be deleted, with its tasks, updates, sharing and
  // links, by whoever manages it (its creator, owner or an administrator).
  // The audit trail keeps a record.
  app.delete('/projects/:id', async (req) => {
    const { id: projectId } = parse(serialParam, req.params);
    await assertAccess(db, req.user, projectId, 'manage');
    const { rows: [p] } = await db.query('select status, island_id from projects where id = $1', [projectId]);
    if (p.status !== 'cancelled') throw badRequest('Only a cancelled project can be deleted: cancel it first');
    if (p.island_id) await assertIslandWrite(db, req.user, { islandId: p.island_id });
    await db.tx(req.user.id, (t) => t.query('delete from projects where id = $1', [projectId]));
    return { ok: true };
  });

  app.patch('/projects/:id', async (req) => {
    const { id: projectId } = parse(serialParam, req.params);
    // Only fields actually sent are updated; defaults from the create schema don't apply.
    const patch = parsePatch(body.omit({ island_id: true }).partial(), req.body);
    const sharing = patch.visibility !== undefined || patch.members !== undefined || patch.owner_id !== undefined || patch.unit_id !== undefined;
    await assertAccess(db, req.user, projectId, sharing ? 'manage' : 'edit');
    const members = patch.members;
    delete patch.members;
    const tasks = patch.tasks;
    delete patch.tasks;
    if (tasks) {
      const { rows: [{ n }] } = await db.query('select count(*)::int as n from project_tasks where project_id = $1 and (code is not null or status is not null)', [projectId]);
      if (n) throw badRequest('This project\'s tasks are tracked one by one: update them on the Tracker');
    }
    // With tasks, overall progress is calculated from them.
    const { rows: [{ n: taskCount }] } = await db.query('select count(*)::int as n from project_tasks where project_id = $1', [projectId]);
    if ((tasks ? tasks.length : taskCount) > 0) delete patch.progress_pct;
    await db.tx(req.user.id, async (t) => {
      if (Object.keys(patch).length) {
        const set = updateSet(patch, COLS);
        await t.query(`update projects set ${set.sql} where id = $1`, [projectId, ...set.values]);
      }
      if (members) await writeMembers(t, projectId, members, req.user.id);
      if (tasks) await writeTasks(t, projectId, tasks);
    });
    const row = one((await db.query(`${SELECT} where p.id = $1`, [projectId])).rows);
    delete row.total_count;
    return row;
  });

  // Progress notes, posted by people who can edit the project.
  app.post('/projects/:id/updates', async (req, reply) => {
    const { id: projectId } = parse(serialParam, req.params);
    const b = parse(updateBody, req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    const { rows: [{ n: taskCount }] } = await db.query('select count(*)::int as n from project_tasks where project_id = $1', [projectId]);
    if (taskCount && b.progress_pct != null) throw badRequest('Progress is calculated from the tasks: update the task breakdown instead');
    const { rows } = await db.tx(req.user.id, (t) => t.query(`
      insert into project_updates (project_id, body, progress_pct, status, created_by)
      values ($1, $2, $3, $4, $5) returning *`,
    [projectId, b.body, b.progress_pct ?? null, b.status ?? null, req.user.id]));
    reply.code(201);
    return rows[0];
  });

  // The author may correct an update's text for 8 hours after posting it.
  app.patch('/projects/:id/updates/:updateId', async (req) => {
    const { id: projectId, updateId } = parse(z.object({ id: z.coerce.number().int().positive(), updateId: z.coerce.number().int().positive() }), req.params);
    const b = parse(z.object({ body: text(5000) }), req.body);
    await assertAccess(db, req.user, projectId, 'view');
    return editUpdate(db, req.user, 'project_updates', 'project_id', projectId, updateId, b.body);
  });

  // Files: links to Microsoft 365, edited there. Same access as editing.
  linkRoutes(app, 'project', '/projects/:id', (req, projectId) => assertAccess(db, req.user, projectId, 'edit'));
}
