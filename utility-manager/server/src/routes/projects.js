import { z } from 'zod';
import { assertIslandWrite, requireAllowed } from '../auth.js';
import { sendCsv } from '../csv.js';
import { forbidden, notFound } from '../errors.js';
import { Where, date, id, one, optText, pageOf, paging, parse, serialParam, service, text, updateSet } from '../http.js';

const STATES = ['planned', 'ongoing', 'on_hold', 'completed', 'cancelled'];

const body = z.object({
  service,
  island_id: id.nullish(),
  facility_id: id.nullish(),
  title: text(200),
  description: optText(5000),
  status: z.enum(STATES).default('planned'),
  progress_pct: z.number().int().min(0).max(100).default(0),
  budget: z.number().nonnegative().nullish(),
  contractor: optText(200),
  start_date: date.nullish(),
  target_date: date.nullish(),
  completed_on: date.nullish(),
  owner_id: id.nullish(),
  // Who can see it: everyone, or only the people listed (plus the creator,
  // the owner and administrators).
  visibility: z.enum(['everyone', 'members']).optional(),
  members: z.array(z.object({ user_id: id, access: z.enum(['view', 'edit']) })).max(200).optional(),
});
const COLS = ['service', 'facility_id', 'title', 'description', 'status', 'progress_pct', 'budget',
  'contractor', 'start_date', 'target_date', 'completed_on', 'owner_id', 'visibility'];
const updateBody = z.object({
  body: text(5000),
  progress_pct: z.number().int().min(0).max(100).nullish(),
  status: z.enum(STATES).nullish(),
});

const listQuery = paging.extend({
  status: z.enum([...STATES, 'active']).optional(), // active = planned, ongoing or on hold
  service: service.optional(),
  island_id: id.optional(),
  atoll_id: id.optional(),
  q: z.string().max(100).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const SELECT = `
  select p.*, 'PRJ-' || lpad(p.id::text, 4, '0') as ref,
         i.name as island_name, i.atoll_id, a.code as atoll_code, f.name as facility_name,
         o.full_name as owner_name,
         (p.target_date < current_date and p.status in ('planned', 'ongoing', 'on_hold')) as overdue,
         (select max(created_at) from project_updates u where u.project_id = p.id) as last_update_at,
         count(*) over () as total_count
    from projects p
    left join islands i on i.id = p.island_id
    left join atolls a on a.id = i.atoll_id
    left join facilities f on f.id = p.facility_id
    left join users o on o.id = p.owner_id`;

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
           or exists (select 1 from project_members m where m.project_id = p.id and m.user_id = $${n}))`,
    values: [user.id],
  };
}

// The user's access to one project: null (none), 'view', 'edit' or 'manage'
// (edit, and choose who has access: creator, owner, administrators).
async function accessTo(db, user, projectId) {
  const { rows } = await db.query(`
    select p.visibility, p.created_by, p.owner_id,
           (select access from project_members m where m.project_id = p.id and m.user_id = $2) as member
      from projects p where p.id = $1`, [projectId, user.id]);
  const p = one(rows, 'Project');
  if (user.role === 'admin' || p.created_by === user.id || p.owner_id === user.id) return 'manage';
  if (p.member === 'edit') return 'edit';
  if (p.member === 'view' || p.visibility === 'everyone') return 'view';
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

async function writeMembers(t, projectId, members, addedBy) {
  await t.query('delete from project_members where project_id = $1', [projectId]);
  for (const m of members) {
    await t.query(`insert into project_members (project_id, user_id, access, added_by) values ($1, $2, $3, $4)
                   on conflict (project_id, user_id) do update set access = excluded.access`, [projectId, m.user_id, m.access, addedBy]);
  }
}

export default async function projectRoutes(app) {
  const { db } = app;

  app.get('/projects', async (req, reply) => {
    const q = parse(listQuery, req.query);
    const vis = projectVisible(req.user, 1);
    const w = new Where(vis.values)
      .raw(vis.sql)
      .add('p.service = ?', q.service).add('p.island_id = ?', q.island_id).add('i.atoll_id = ?', q.atoll_id)
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
        ['Ref', 'ref'], ['Atoll', 'atoll_code'], ['Island', 'island_name'], ['Service', 'service'],
        ['Title', 'title'], ['Status', 'status'], ['Progress %', 'progress_pct'], ['Budget', 'budget'],
        ['Contractor', 'contractor'], ['Start', 'start_date'], ['Target', 'target_date'],
        ['Completed', 'completed_on'], ['Owner', 'owner_name'], ['Description', 'description'],
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
    project.members = (await db.query(`
      select m.user_id, m.access, u.full_name, u.designation from project_members m join users u on u.id = m.user_id
       where m.project_id = $1 order by m.access desc, u.full_name`, [projectId])).rows;
    project.updates = (await db.query(`
      select u.*, us.full_name as created_by_name from project_updates u
        left join users us on us.id = u.created_by
       where u.project_id = $1 order by u.created_at desc`, [projectId])).rows;
    return project;
  });

  app.post('/projects', { preHandler: requireAllowed('projects', 'You are not allowed to create projects. Ask an administrator.') }, async (req, reply) => {
    const b = parse(body, req.body);
    await assertProjectCreate(db, req.user, b.island_id);
    const rows = await db.tx(req.user.id, async (t) => {
      const res = await t.query(`
        insert into projects (service, island_id, facility_id, title, description, status, progress_pct, budget,
                              contractor, start_date, target_date, completed_on, owner_id, created_by, visibility)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning id`,
      [b.service, b.island_id ?? null, b.facility_id ?? null, b.title, b.description, b.status, b.progress_pct,
        b.budget ?? null, b.contractor, b.start_date ?? null, b.target_date ?? null, b.completed_on ?? null,
        b.owner_id ?? null, req.user.id, b.visibility ?? 'members']);
      await writeMembers(t, res.rows[0].id, (b.members || []).filter((m) => m.user_id !== req.user.id), req.user.id);
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
    const sharing = patch.visibility !== undefined || patch.members !== undefined || patch.owner_id !== undefined;
    await assertAccess(db, req.user, projectId, sharing ? 'manage' : 'edit');
    const members = patch.members;
    delete patch.members;
    await db.tx(req.user.id, async (t) => {
      if (Object.keys(patch).length) {
        const set = updateSet(patch, COLS);
        await t.query(`update projects set ${set.sql} where id = $1`, [projectId, ...set.values]);
      }
      if (members) await writeMembers(t, projectId, members, req.user.id);
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
    const { rows } = await db.tx(req.user.id, (t) => t.query(`
      insert into project_updates (project_id, body, progress_pct, status, created_by)
      values ($1, $2, $3, $4, $5) returning *`,
    [projectId, b.body, b.progress_pct ?? null, b.status ?? null, req.user.id]));
    reply.code(201);
    return rows[0];
  });
}
