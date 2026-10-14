// A project's task tracker (migration 040; first for the Powerhouse
// Takeover): tasks with codes, priorities and statuses, updated one at a
// time, and for each site the systems to get access to and the checklists.
// Who may change them is the project's own access (assertAccess).
import { z } from 'zod';
import { notFound } from '../errors.js';
import { date, id, one, optText, parse, parsePatch, serialParam, unitId, updateSet } from '../http.js';
import { localToday } from '../time.js';
import { assertAccess } from './projects.js';

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

export async function loadTasks(db, projectId) {
  return (await db.query(`${TASK_SELECT} where t.project_id = $1 order by t.position`, [projectId])).rows;
}

// Sites with access lists or checklists, and how far along each is.
export async function loadSites(db, projectId) {
  return (await db.query(`
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
}

export default async function trackerRoutes(app) {
  const { db, config } = app;

  const itemParams = z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() });

  app.patch('/projects/:id/tasks/:itemId', async (req) => {
    const { id: projectId, itemId } = parse(itemParams, req.params);
    const patch = parsePatch(trackerTask, req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    const current = one((await db.query('select * from project_tasks where id = $1 and project_id = $2', [itemId, projectId])).rows, 'Task');
    // Completed means done: 100%, dated today unless a date is given.
    // Leaving Completed clears the date; work started moves it to In Progress.
    if (patch.status === 'Completed') {
      if (patch.progress === undefined) patch.progress = 100;
      if (patch.completed_date === undefined && !current.completed_date) {
        patch.completed_date = localToday(config.timezone);
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

  // A new task: numbered after the project's last code (TKO-026 → TKO-027).
  app.post('/projects/:id/tasks', async (req, reply) => {
    const { id: projectId } = parse(serialParam, req.params);
    const b = parsePatch(trackerTask.required({ name: true }), req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    const { rows: [last] } = await db.query(`
      select max(position) as position, (select code from project_tasks where project_id = $1 and code ~ '^[A-Za-z]+-[0-9]+$'
                                           order by substring(code from '[0-9]+$')::int desc limit 1) as code,
             (select unit_id from projects where id = $1) as unit_id
        from project_tasks where project_id = $1`, [projectId]);
    const m = /^([A-Za-z]+-)(\d+)$/.exec(last.code || '');
    const code = m ? `${m[1]}${String(Number(m[2]) + 1).padStart(m[2].length, '0')}` : null;
    const row = { status: 'Not Started', progress: 0, unit_id: last.unit_id, ...b };
    if (row.status === 'Completed') { row.progress = 100; row.completed_date ??= localToday(config.timezone); }
    const cols = TASK_COLS.filter((k) => row[k] !== undefined);
    const { rows: [{ id: taskId }] } = await db.tx(req.user.id, (t) => t.query(
      `insert into project_tasks (project_id, position, code, ${cols.join(', ')})
       values ($1, $2, $3, ${cols.map((_, i) => `$${i + 4}`).join(', ')}) returning id`,
      [projectId, (last.position || 0) + 1, code, ...cols.map((k) => row[k])]));
    reply.code(201);
    return one((await db.query(`${TASK_SELECT} where t.id = $1`, [taskId])).rows);
  });

  app.delete('/projects/:id/tasks/:itemId', async (req) => {
    const { id: projectId, itemId } = parse(itemParams, req.params);
    await assertAccess(db, req.user, projectId, 'edit');
    const { rowCount } = await db.tx(req.user.id, (t) => t.query('delete from project_tasks where id = $1 and project_id = $2', [itemId, projectId]));
    if (!rowCount) throw notFound('Task');
    return { ok: true };
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
    const patch = parsePatch(accessPatch, req.body);
    await assertAccess(db, req.user, projectId, 'edit');
    const current = one((await db.query('select * from project_access_items where id = $1 and project_id = $2', [itemId, projectId])).rows, 'Access item');
    // Requested / granted today, unless a date is given.
    const today = () => localToday(config.timezone);
    if (patch.status === 'Requested' && patch.requested_on === undefined && !current.requested_on) patch.requested_on = today();
    if (patch.status === 'Granted' && patch.granted_on === undefined && !current.granted_on) patch.granted_on = today();
    if (Object.keys(patch).length) {
      const set = updateSet(patch, ['status', 'requested_on', 'granted_on', 'granted_to', 'remarks']);
      await db.tx(req.user.id, (t) => t.query(`update project_access_items set ${set.sql} where id = $1`, [itemId, ...set.values]));
    }
    return one((await db.query('select * from project_access_items where id = $1', [itemId])).rows);
  });

  app.patch('/projects/:id/checklist/:itemId', async (req) => {
    const { id: projectId, itemId } = parse(itemParams, req.params);
    const patch = parsePatch(checklistPatch, req.body);
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
}
