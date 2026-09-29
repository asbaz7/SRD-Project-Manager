import { z } from 'zod';
import {
  SESSION_COOKIE, burnPasswordCheck, createSession, destroySession, hashPassword,
  passwordProblem, verifyPassword,
} from '../auth.js';
import { badRequest, unauthorized } from '../errors.js';
import { parse } from '../http.js';

const login = z.object({ email: z.string().trim().toLowerCase().email().max(200), password: z.string().min(1).max(200) });
const change = z.object({ current_password: z.string().min(1).max(200), new_password: z.string().max(200) });

export default async function authRoutes(app) {
  const { db, config } = app;

  const cookieOptions = (expires) => ({
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    expires,
  });

  app.post('/auth/login', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { email, password } = parse(login, req.body);
    const { rows } = await db.query(
      'select id, password_hash from users where lower(email) = $1 and active',
      [email],
    );
    const user = rows[0];
    if (!user) {
      await burnPasswordCheck(password);
      throw unauthorized('Email or password is incorrect');
    }
    if (!(await verifyPassword(password, user.password_hash))) throw unauthorized('Email or password is incorrect');

    const session = await createSession(db, user.id, {
      ttlHours: config.sessionTtlHours, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    await db.query('update users set last_login_at = now() where id = $1', [user.id]);
    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    // The token is also returned for API clients that use a Bearer header.
    return { token: session.token, expires_at: session.expiresAt };
  });

  app.post('/auth/logout', async (req, reply) => {
    const header = req.headers.authorization;
    await destroySession(db, header?.startsWith('Bearer ') ? header.slice(7) : req.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (req) => req.user);

  app.post('/auth/password', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = parse(change, req.body);
    const problem = passwordProblem(body.new_password);
    if (problem) throw badRequest(problem);
    const { rows } = await db.query('select password_hash from users where id = $1', [req.user.id]);
    if (!(await verifyPassword(body.current_password, rows[0].password_hash))) {
      throw badRequest('Current password is incorrect');
    }
    const hash = await hashPassword(body.new_password);
    await db.tx(req.user.id, async (t) => {
      await t.query('update users set password_hash = $2, must_change_password = false where id = $1', [req.user.id, hash]);
      await t.query('delete from sessions where user_id = $1', [req.user.id]); // sign out everywhere
    });
    const session = await createSession(db, req.user.id, {
      ttlHours: config.sessionTtlHours, ip: req.ip, userAgent: req.headers['user-agent'],
    });
    reply.setCookie(SESSION_COOKIE, session.token, cookieOptions(session.expiresAt));
    return { ok: true, token: session.token };
  });
}
