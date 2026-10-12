import { z } from 'zod';
import { assertIslandWrite, requireAllowed } from '../auth.js';
import { sendCsv } from '../csv.js';
import { zipSync } from 'fflate';
import { badRequest, forbidden, notFound } from '../errors.js';
import { esc } from '../telegram.js';
import { editUpdate } from './work.js';
import { Where, date, id, one, optText, pageOf, paging, parse, serialParam, service, text, unitId, updateSet } from '../http.js';

const STATES = ['planned', 'ongoing', 'on_hold', 'completed', 'cancelled'];

export const PROJECT_TYPES = ['mechanical', 'electrical', 'infrastructure', 'office_cs', 'maintenance', 'store', 'workshop', 'staff_area'];
const task = z.object({ name: z.string().trim().min(1).max(200), progress: z.number().min(0).max(100).default(0) });

// Task tracker fields (migration 040): set one task at a time.
export const TASK_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
export const DEPARTMENTS = ['HR', 'IT', 'Finance', 'Corporate', 'Corporate (Safety Unit)', 'CS Billing', 'Store', 'Department', 'Powerhouse', 'T&D', 'Water'];
const trackerTask = z.object({
  name: z.string().trim().min(1).max(300),
  action: optText(2000),
  category: optText(100),
  source_no: optText(20),
  responsible_dept: z.enum(DEPARTMENTS).nullish(),
  unit_id: unitId.nullish(),
  priority: z.number().int().min(1).max(4).nullish(),
  island_id: id.nullish(),
  assigned_user_id: id.nullish(),
  assigned_to: optText(200),
  start_date: date.nullish(),
  due_date: date.nullish(),
  status: z.enum(TASK_STATUSES),
  progress: z.number().min(0).max(100),
  completed_date: date.nullish(),
  remarks: optText(2000),
}).partial();
const TASK_COLS = ['name', 'action', 'category', 'source_no', 'responsible_dept', 'unit_id', 'priority', 'island_id', 'assigned_user_id',
  'assigned_to', 'start_date', 'due_date', 'status', 'progress', 'completed_date', 'remarks'];
const accessPatch = z.object({
  status: z.enum(['Not Requested', 'Requested', 'Granted', 'Rejected']),
  requested_on: date.nullish(),
  granted_on: date.nullish(),
  granted_to: optText(200),
  remarks: optText(1000),
}).partial();
const checklistPatch = z.object({
  availability: z.enum(['Available', 'Not Available', 'Partial', 'Requested']).nullish(),
  quantity: z.number().min(0).nullish(),
  available_qty: z.number().min(0).nullish(),
  remarks: optText(1000),
}).partial();
const TODAY = "(now() at time zone 'Indian/Maldives')::date";
const TASK_SELECT = `
  select t.*, i.name as island_name, a.code as atoll_code, u.name as unit_name, au.full_name as assigned_user_name,
         (t.due_date < ${TODAY} and t.status not in ('Completed', 'Cancelled')) as overdue
    from project_tasks t
    left join islands i on i.id = t.island_id left join atolls a on a.id = i.atoll_id
    left join units u on u.id = t.unit_id left join users au on au.id = t.assigned_user_id`;

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
  select p.*, 'PRJ-' || lpad(p.id::text, 4, '0') as ref,
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

async function assertAccess(db, user, projectId, needed) {
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

const MAX_FILE = 10 * 1024 * 1024;
const CLOSED = ['completed', 'cancelled'];

// Daily: delete files of projects closed more than 30 days ago.
export async function purgeProjectFiles(db) {
  const { rowCount } = await db.query(`
    delete from project_files f using projects p
     where p.id = f.project_id and p.files_delete_after is not null and p.files_delete_after <= current_date`);
  return rowCount;
}

export default async function projectRoutes(app) {
  const { db, telegram } = app;

  // When a project with files closes, tell its creator and owner when the
  // files will be deleted.
  async function announceFileDeletion(projectId, before) {
    if (CLOSED.includes(before)) return;
    const { rows: [p] } = await db.query(`
      select p.id, 'PRJ-' || lpad(p.id::text, 4, '0') as ref, p.title, p.status, p.files_delete_after, p.created_by, p.owner_id,
             (select count(*)::int from project_files f where f.project_id = p.id) as files
        from projects p where p.id = $1`, [projectId]);
    if (!p || !CLOSED.includes(p.status) || !p.files) return;
    const when = new Date(`${String(p.files_delete_after).slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const text = `📁 <b>${esc(p.ref)} ${esc(p.title)}</b> is ${p.status}. Its ${p.files} file${p.files === 1 ? '' : 's'} will be deleted on ${when}: download them before then.\n${telegram.link(`/projects/${p.id}`, 'Open')}`;
    for (const userId of new Set([p.created_by, p.owner_id].filter(Boolean))) await telegram.notifyUser(userId, text);
  }

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
    project.tasks = (await db.query(`${TASK_SELECT} where t.project_id = $1 order by t.position`, [projectId])).rows;
    // A tracker: tasks with codes, statuses and so on, edited one at a time.
    project.tracker = project.tasks.some((t) => t.code || t.status);
    // Sites with access lists or checklists, and how far along each is.
    project.sites = (await db.query(`
      select i.id as island_id, i.name as island_name, a.code as atoll_code,
             count(x.id) filter (where x.kind = 'access') as access_total,
             count(x.id) filter (where x.kind = 'access' and x.done) as access_granted,
             count(x.id) filter (where x.kind = 'access' and x.state = 'Requested') as access_requested,
             count(x.id) filter (where x.kind = 'check') as checklist_total,
             count(x.id) filter (where x.kind = 'check' and x.state is not null) as checklist_checked,
             count(x.id) filter (where x.kind = 'check' and x.state = 'Not Available') as checklist_missing,
             count(x.id) filter (where x.kind = 'check' and x.short) as stationery_short
        from (select island_id, id, 'access' as kind, status as state, status = 'Granted' as done, false as short
                from project_access_items where project_id = $1
              union all
              select island_id, id, 'check', coalesce(availability, case when available_qty is not null then 'Counted' end), false,
                     list = 'stationery' and required_qty is not null and available_qty is not null and available_qty < required_qty
                from project_checklist_items where project_id = $1) x
        join islands i on i.id = x.island_id join atolls a on a.id = i.atoll_id
       group by i.id, a.code order by a.code, i.name`, [projectId])).rows;
    project.files = (await db.query(`
      select f.id, f.file_name, f.content_type, f.size_bytes, f.uploaded_at, u.full_name as uploaded_by_name
        from project_files f left join users u on u.id = f.uploaded_by where f.project_id = $1 order by f.uploaded_at`, [projectId])).rows;
    project.files_total_bytes = project.files.reduce((n, f) => n + Number(f.size_bytes), 0);
    project.members = (await db.query(`
      select m.user_id, m.access, u.full_name, u.designation from project_members m join users u on u.id = m.user_id
       where m.project_id = $1 order by m.access desc, u.full_name`, [projectId])).rows;
    project.updates = (await db.query(`
      select u.*, us.full_name as created_by_name, (u.created_by = $2 and u.created_at > now() - interval '8 hours') as can_edit from project_updates u
        left join users us on us.id = u.created_by
       where u.project_id = $1 order by u.created_at desc`, [projectId, req.user.id])).rows;
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

  app.patch('/projects/:id', async (req) => {
    const { id: projectId } = parse(serialParam, req.params);
    // Only fields actually sent are updated; defaults from the create schema don't apply.
    const patch = parse(body.omit({ island_id: true }).partial(), req.body);
    for (const k of Object.keys(patch)) if (!(k in (req.body || {}))) delete patch[k];
    const before = one((await db.query('select status from projects where id = $1', [projectId])).rows, 'Project').status;
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
    if (patch.status) await announceFileDeletion(projectId, before);
    return row;
  });

  // Progress notes, posted by people who can edit the project.
  app.post('/projects/:id/updates', async (req, reply) => {
    const { id: projectId } = parse(serialParam, req.params);
    const b = parse(updateBody, req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    const before = one((await db.query('select status from projects where id = $1', [projectId])).rows, 'Project').status;
    const { rows: [{ n: taskCount }] } = await db.query('select count(*)::int as n from project_tasks where project_id = $1', [projectId]);
    if (taskCount && b.progress_pct != null) throw badRequest('Progress is calculated from the tasks: update the task breakdown instead');
    const { rows } = await db.tx(req.user.id, (t) => t.query(`
      insert into project_updates (project_id, body, progress_pct, status, created_by)
      values ($1, $2, $3, $4, $5) returning *`,
    [projectId, b.body, b.progress_pct ?? null, b.status ?? null, req.user.id]));
    if (b.status) await announceFileDeletion(projectId, before);
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

  // --- Tracker: one task, access item or checklist item at a time ----------
  const itemParams = z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() });
  // Only the fields sent are changed.
  const sent = (schema, b) => {
    const patch = parse(schema, b);
    for (const k of Object.keys(patch)) if (!(k in (b || {}))) delete patch[k];
    return patch;
  };

  app.patch('/projects/:id/tasks/:itemId', async (req) => {
    const { id: projectId, itemId } = parse(itemParams, req.params);
    const patch = sent(trackerTask, req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    const current = one((await db.query('select * from project_tasks where id = $1 and project_id = $2', [itemId, projectId])).rows, 'Task');
    // Completed means done: 100%, dated today unless a date is given.
    // Leaving Completed clears the date; work started moves it to In Progress.
    if (patch.status === 'Completed') {
      if (patch.progress === undefined) patch.progress = 100;
      if (patch.completed_date === undefined && !current.completed_date) {
        patch.completed_date = (await db.query(`select to_char(${TODAY}, 'YYYY-MM-DD') as d`)).rows[0].d;
      }
    } else if (patch.status && current.status === 'Completed' && patch.completed_date === undefined) {
      patch.completed_date = null;
    }
    if (!patch.status && (current.status ?? 'Not Started') === 'Not Started' && patch.progress > 0 && patch.progress < 100) patch.status = 'In Progress';
    if (patch.progress !== undefined) patch.progress = Math.round(patch.progress * 10) / 10;
    if (Object.keys(patch).length) {
      const set = updateSet(patch, TASK_COLS);
      await db.tx(req.user.id, (t) => t.query(`update project_tasks set ${set.sql} where id = $1`, [itemId, ...set.values]));
    }
    return one((await db.query(`${TASK_SELECT} where t.id = $1`, [itemId])).rows);
  });

  // One site's access list and checklists.
  app.get('/projects/:id/sites/:islandId', async (req) => {
    const { id: projectId, islandId } = parse(z.object({ id: z.coerce.number().int().positive(), islandId: id }), req.params);
    const access = await assertAccess(db, req.user, projectId, 'view');
    const island = one((await db.query('select i.id, i.name, a.code as atoll_code from islands i join atolls a on a.id = i.atoll_id where i.id = $1', [islandId])).rows, 'Island');
    const [{ rows: accessItems }, { rows: checklist }] = await Promise.all([
      db.query('select * from project_access_items where project_id = $1 and island_id = $2 order by position', [projectId, islandId]),
      db.query(`select *, case when list = 'stationery' and required_qty is not null and available_qty is not null
                               then greatest(0, required_qty - available_qty) end as shortfall
                  from project_checklist_items where project_id = $1 and island_id = $2 order by list, position`, [projectId, islandId]),
    ]);
    return { island, access_items: accessItems, checklist, can_edit: access === 'edit' || access === 'manage' };
  });

  app.patch('/projects/:id/access/:itemId', async (req) => {
    const { id: projectId, itemId } = parse(itemParams, req.params);
    const patch = sent(accessPatch, req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    const current = one((await db.query('select * from project_access_items where id = $1 and project_id = $2', [itemId, projectId])).rows, 'Access item');
    // Requested / granted today, unless a date is given.
    const today = async () => (await db.query(`select to_char(${TODAY}, 'YYYY-MM-DD') as d`)).rows[0].d;
    if (patch.status === 'Requested' && patch.requested_on === undefined && !current.requested_on) patch.requested_on = await today();
    if (patch.status === 'Granted' && patch.granted_on === undefined && !current.granted_on) patch.granted_on = await today();
    if (Object.keys(patch).length) {
      const set = updateSet(patch, ['status', 'requested_on', 'granted_on', 'granted_to', 'remarks']);
      await db.tx(req.user.id, (t) => t.query(`update project_access_items set ${set.sql} where id = $1`, [itemId, ...set.values]));
    }
    return one((await db.query('select * from project_access_items where id = $1', [itemId])).rows);
  });

  app.patch('/projects/:id/checklist/:itemId', async (req) => {
    const { id: projectId, itemId } = parse(itemParams, req.params);
    const patch = sent(checklistPatch, req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    one((await db.query('select id from project_checklist_items where id = $1 and project_id = $2', [itemId, projectId])).rows, 'Checklist item');
    if (Object.keys(patch).length) {
      const set = updateSet(patch, ['availability', 'quantity', 'available_qty', 'remarks']);
      await db.tx(req.user.id, (t) => t.query(`update project_checklist_items set ${set.sql} where id = $1`, [itemId, ...set.values]));
    }
    return one((await db.query(`select *, case when list = 'stationery' and required_qty is not null and available_qty is not null
                                         then greatest(0, required_qty - available_qty) end as shortfall
                                  from project_checklist_items where id = $1`, [itemId])).rows);
  });

  // --- Files: kept while the project is open --------------------------------
  const fileParams = z.object({ id: z.coerce.number().int().positive(), fileId: z.coerce.number().int().positive() });

  app.post('/projects/:id/files', async (req, reply) => {
    const { id: projectId } = parse(serialParam, req.params);
    const b = parse(z.object({ file_name: z.string().trim().min(1).max(200), content_type: z.string().max(100).optional(), data: z.string().min(1) }), req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    const { rows: [p] } = await db.query('select status from projects where id = $1', [projectId]);
    if (CLOSED.includes(p.status)) throw badRequest('This project is closed: files can no longer be added');
    const bytes = Buffer.from(b.data, 'base64');
    if (!bytes.length) throw badRequest('The file is empty');
    if (bytes.length > MAX_FILE) throw badRequest('Files can be up to 10 MB');
    const { rows } = await db.query(`insert into project_files (project_id, file_name, content_type, size_bytes, data, uploaded_by)
      values ($1, $2, $3, $4, $5, $6) returning id, file_name, size_bytes`,
    [projectId, b.file_name, b.content_type || 'application/octet-stream', bytes.length, bytes, req.user.id]);
    reply.code(201);
    return rows[0];
  });

  app.get('/projects/:id/files/:fileId', async (req, reply) => {
    const { id: projectId, fileId } = parse(fileParams, req.params);
    await assertAccess(db, req.user, projectId, 'view');
    const f = one((await db.query('select file_name, content_type, data from project_files where id = $1 and project_id = $2', [fileId, projectId])).rows, 'File');
    reply.header('content-type', f.content_type);
    reply.header('content-disposition', `attachment; filename="${f.file_name.replace(/["\\\r\n]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.file_name)}`);
    return reply.send(f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data));
  });

  // Every file in one ZIP (stored, not recompressed: they're mostly PDFs).
  app.get('/projects/:id/zip', async (req, reply) => {
    const { id: projectId } = parse(serialParam, req.params);
    await assertAccess(db, req.user, projectId, 'view');
    const { rows } = await db.query('select file_name, data from project_files where project_id = $1 order by uploaded_at', [projectId]);
    if (!rows.length) throw notFound('Files');
    const entries = {};
    for (const r of rows) {
      let name = r.file_name.replace(/[\\/:*?"<>|]/g, '_');
      for (let n = 2; entries[name]; n++) name = r.file_name.replace(/(\.[^.]*)?$/, (ext) => ` (${n})${ext || ''}`);
      entries[name] = [r.data instanceof Uint8Array ? r.data : new Uint8Array(r.data), { level: 0 }];
    }
    const zip = zipSync(entries);
    reply.header('content-type', 'application/zip');
    reply.header('content-disposition', `attachment; filename="PRJ-${String(projectId).padStart(4, '0')} files.zip"`);
    return reply.send(zip);
  });

  app.delete('/projects/:id/files/:fileId', async (req) => {
    const { id: projectId, fileId } = parse(fileParams, req.params);
    await assertAccess(db, req.user, projectId, 'edit');
    await db.query('delete from project_files where id = $1 and project_id = $2', [fileId, projectId]);
    return { ok: true };
  });

  app.delete('/projects/:id/files', async (req) => {
    const { id: projectId } = parse(serialParam, req.params);
    await assertAccess(db, req.user, projectId, 'edit');
    const { rowCount } = await db.query('delete from project_files where project_id = $1', [projectId]);
    return { ok: true, deleted: rowCount };
  });
}
