import { z } from 'zod';
import { hashPassword, passwordProblem, requireRole } from '../auth.js';
import { badRequest } from '../errors.js';
import { id, idParam, one, optText, parse, text, updateSet } from '../http.js';

const role = z.enum(['admin', 'manager', 'viewer']);
// A scope is one island, one atoll, or { region: true }.
const scope = z.union([
  z.object({ island_id: id }),
  z.object({ atoll_id: id }),
  z.object({ region: z.literal(true) }),
]);

const create = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  full_name: text(200),
  designation: optText(200),
  phone: optText(50),
  role,
  password: z.string().max(200),
  scopes: z.array(scope).max(200).default([]),
});
const patch = create.omit({ email: true, password: true }).partial().extend({
  active: z.boolean().optional(),
  password: z.string().max(200).optional(), // admin reset: user must change it at next sign-in
});

const LIST_SQL = `
  select u.id, u.email, u.full_name, u.designation, u.phone, u.role, u.active,
         u.must_change_password, u.last_login_at, u.created_at,
         coalesce(json_agg(json_build_object(
           'atoll_id', s.atoll_id, 'island_id', s.island_id,
           'label', coalesce(a.code, ia.code || ' · ' || i.name, 'Whole region')
         ) order by a.code, ia.code, i.name) filter (where s.id is not null), '[]') as scopes
    from users u
    left join user_scopes s on s.user_id = u.id
    left join atolls a on a.id = s.atoll_id
    left join islands i on i.id = s.island_id
    left join atolls ia on ia.id = i.atoll_id`;

async function writeScopes(t, userId, scopes) {
  await t.query('delete from user_scopes where user_id = $1', [userId]);
  for (const s of scopes) {
    await t.query('insert into user_scopes (user_id, atoll_id, island_id) values ($1, $2, $3)',
      [userId, s.atoll_id ?? null, s.island_id ?? null]);
  }
}

export default async function userRoutes(app) {
  const { db } = app;
  const admin = { preHandler: requireRole('admin') };

  app.get('/users', admin, async () => {
    const { rows } = await db.query(`${LIST_SQL} group by u.id order by u.active desc, u.full_name`);
    return rows;
  });

  // Lightweight list for pickers (project owner, etc.), visible to everyone signed in.
  app.get('/users/directory', async () => {
    const { rows } = await db.query('select id, full_name, designation, role from users where active order by full_name');
    return rows;
  });

  app.post('/users', admin, async (req, reply) => {
    const body = parse(create, req.body);
    const problem = passwordProblem(body.password);
    if (problem) throw badRequest(problem);
    const hash = await hashPassword(body.password);
    const user = await db.tx(req.user.id, async (t) => {
      const { rows } = await t.query(
        `insert into users (email, full_name, designation, phone, role, password_hash, must_change_password)
         values ($1, $2, $3, $4, $5, $6, true) returning id`,
        [body.email, body.full_name, body.designation, body.phone, body.role, hash],
      );
      await writeScopes(t, rows[0].id, body.scopes);
      return rows[0];
    });
    reply.code(201);
    return one((await db.query(`${LIST_SQL} where u.id = $1 group by u.id`, [user.id])).rows, 'User');
  });

  app.patch('/users/:id', admin, async (req) => {
    const { id: userId } = parse(idParam, req.params);
    const body = parse(patch, req.body);
    if (userId === req.user.id && (body.active === false || (body.role && body.role !== 'admin'))) {
      throw badRequest('You cannot deactivate or demote your own account');
    }
    const fields = { ...body };
    delete fields.scopes;
    delete fields.password;
    if (body.password !== undefined) {
      const problem = passwordProblem(body.password);
      if (problem) throw badRequest(problem);
      fields.password_hash = await hashPassword(body.password);
      fields.must_change_password = true;
    }
    await db.tx(req.user.id, async (t) => {
      const cols = ['full_name', 'designation', 'phone', 'role', 'active', 'password_hash', 'must_change_password'];
      if (Object.keys(fields).some((k) => cols.includes(k))) {
        const set = updateSet(fields, cols);
        one((await t.query(`update users set ${set.sql} where id = $1 returning id`, [userId, ...set.values])).rows, 'User');
      }
      if (body.scopes) await writeScopes(t, userId, body.scopes);
      // Deactivated users, role changes and password resets end existing sessions.
      if (body.active === false || body.role || body.password !== undefined) {
        await t.query('delete from sessions where user_id = $1', [userId]);
      }
    });
    return one((await db.query(`${LIST_SQL} where u.id = $1 group by u.id`, [userId])).rows, 'User');
  });
}
