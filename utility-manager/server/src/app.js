// The REST API (/api/v1), built on Hono so the same code runs on Node.js and
// on Cloudflare Workers. Static files are served by the host: see index.js
// (Node.js) and wrangler.jsonc (Cloudflare).
//
// Route modules register handlers as `app.get(path, [options], handler)`,
// where handler(req, reply) returns the response body (serialised as JSON)
// or uses reply.code() / header() / send(). Options:
//   preHandler: async (req, reply) => {}      e.g. requireRole('manager')
//   config.rateLimit: { max, timeWindow }     e.g. { max: 10, timeWindow: '1 minute' }
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { SESSION_COOKIE, createSession, destroySession, loadSession } from './auth.js';
import { createTelegram } from './telegram.js';
import { parseCookies, serializeCookie } from './cookies.js';
import { HttpError, badRequest, errorHandler, forbidden, notFound, unauthorized } from './errors.js';
import { createLogger, silentLogger } from './logger.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import locationRoutes from './routes/locations.js';
import assetRoutes from './routes/assets.js';
import incidentRoutes from './routes/incidents.js';
import projectRoutes from './routes/projects.js';
import dashboardRoutes from './routes/dashboard.js';
import auditRoutes from './routes/audit.js';
import conditionReportRoutes from './routes/conditionReports.js';
import engineRoutes from './routes/engines.js';
import workRoutes from './routes/work.js';
import serviceRoutes from './routes/services.js';
import telegramRoutes from './routes/telegram.js';

const PREFIX = '/api/v1';
const PUBLIC_ROUTES = new Set([`${PREFIX}/auth/login`, `${PREFIX}/health`, `${PREFIX}/telegram/webhook`]);
const PASSWORD_ROUTES = new Set([`${PREFIX}/auth/password`, `${PREFIX}/auth/me`, `${PREFIX}/auth/logout`]);
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const BODY_LIMIT = 5 * 1024 * 1024; // CSV imports

export const SECURITY_HEADERS = {
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    scriptSrc: ["'self'"],
    connectSrc: ["'self'"],
    frameAncestors: ["'none'"],
  },
};

class Reply {
  statusCode = 200;
  headers = new Headers();
  body = undefined;
  sent = false;

  code(status) { this.statusCode = status; return this; }
  header(name, value) { this.headers.set(name, value); return this; }
  send(body) { this.body = body; this.sent = true; return this; }
  setCookie(name, value, options) { this.headers.append('set-cookie', serializeCookie(name, value, options)); return this; }
  clearCookie(name, options) {
    this.headers.append('set-cookie', serializeCookie(name, '', { ...options, expires: new Date(0) }));
    return this;
  }

  toResponse(result) {
    const body = this.sent || result === this ? this.body : result;
    if (body === undefined) return new Response(null, { status: this.statusCode, headers: this.headers });
    if (typeof body === 'string') {
      if (!this.headers.has('content-type')) this.headers.set('content-type', 'text/plain; charset=utf-8');
      return new Response(body, { status: this.statusCode, headers: this.headers });
    }
    this.headers.set('content-type', 'application/json; charset=utf-8');
    return new Response(JSON.stringify(body), { status: this.statusCode, headers: this.headers });
  }
}

// In-memory fixed-window rate limiter, per app instance. (On Cloudflare each
// Worker isolate counts separately, which still blunts password guessing.)
function createRateLimiter() {
  const windows = new Map();
  const parseWindow = (w) => (typeof w === 'number' ? w : Number.parseInt(w, 10) * (/hour/.test(w) ? 3600_000 : /minute/.test(w) ? 60_000 : 1000));
  return (key, { max, timeWindow }) => {
    const now = Date.now();
    if (windows.size > 10_000) for (const [k, v] of windows) if (v.reset < now) windows.delete(k);
    let entry = windows.get(key);
    if (!entry || entry.reset < now) {
      entry = { count: 0, reset: now + parseWindow(timeWindow) };
      windows.set(key, entry);
    }
    if (++entry.count > max) throw new HttpError(429, 'Too many attempts. Please wait a minute and try again.');
  };
}

function clientIp(c, config) {
  const h = c.req.header.bind(c.req);
  return h('cf-connecting-ip')
    || (config.trustProxy && h('x-forwarded-for')?.split(',')[0].trim())
    || c.env?.incoming?.socket?.remoteAddress
    || 'unknown';
}

export async function buildApp({ db, config, logger = true }) {
  const log = logger === false ? silentLogger : typeof logger === 'object' ? logger : createLogger(config.logLevel);
  const hono = new Hono();
  const rateLimit = createRateLimiter();

  hono.use('*', secureHeaders(SECURITY_HEADERS));

  // Identify the caller from the session cookie or a Bearer token, and apply
  // the rules every API call shares.
  async function authenticate(req) {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
    req.user = await loadSession(db, bearer || req.cookies[SESSION_COOKIE]);
    req.viaCookie = !bearer && !!req.user;

    const path = req.routeOptions.url;
    if (PUBLIC_ROUTES.has(path)) return;
    if (!req.user) throw unauthorized();

    // Cookie-authenticated writes must come from our own pages (CSRF defence
    // on top of SameSite cookies). Hosts are compared, not schemes: behind a
    // TLS-terminating proxy such as Cloudflare the app may see http.
    if (req.viaCookie && UNSAFE.has(req.method)) {
      const origin = req.headers.origin;
      let originHost = null;
      try { originHost = origin && new URL(origin).host; } catch { /* malformed: rejected below */ }
      const allowed = originHost === req.host || config.allowedOrigins.includes(origin);
      if (origin && !allowed) throw forbidden('Cross-site request blocked');
    }
    // A temporary password must be replaced before anything else.
    if (req.user.mustChangePassword && !PASSWORD_ROUTES.has(path)) {
      throw forbidden('Please change your temporary password first');
    }
  }

  async function readBody(c) {
    if (!UNSAFE.has(c.req.method)) return undefined;
    if (Number(c.req.header('content-length') || 0) > BODY_LIMIT) throw new HttpError(413, 'The request is too large');
    const text = await c.req.text();
    if (!text) return undefined;
    if (text.length > BODY_LIMIT) throw new HttpError(413, 'The request is too large');
    if (!/json/i.test(c.req.header('content-type') || '')) throw new HttpError(415, 'Send JSON (content-type: application/json)');
    try {
      return JSON.parse(text);
    } catch {
      throw badRequest('The request body is not valid JSON');
    }
  }

  const handle = (routePath, options, handler) => async (c) => {
    const started = Date.now();
    const url = new URL(c.req.url);
    const reply = new Reply();
    const req = {
      method: c.req.method,
      url: url.pathname + url.search,
      headers: Object.fromEntries(Object.entries(c.req.header()).map(([k, v]) => [k.toLowerCase(), v])),
      params: c.req.param(),
      query: c.req.query(),
      cookies: parseCookies(c.req.header('cookie')),
      ip: clientIp(c, config),
      host: c.req.header('host') || url.host,
      routeOptions: { url: routePath },
      log,
      user: null,
    };
    let response;
    try {
      await authenticate(req);
      if (options.config?.rateLimit) rateLimit(`${routePath}|${req.ip}`, options.config.rateLimit);
      req.body = await readBody(c);
      if (options.preHandler) await options.preHandler(req, reply);
      response = reply.toResponse(await handler(req, reply));
    } catch (err) {
      const errorReply = new Reply();
      errorHandler(err, req, errorReply);
      response = errorReply.toResponse();
    }
    response.headers.set('cache-control', 'no-store');
    log.info({ method: req.method, url: req.url, status: response.status, ms: Date.now() - started, user: req.user?.id }, 'request');
    return response;
  };

  // Run an API call as a given user, with the same checks as the website
  // (used by the Telegram bot): a session that lasts only for this call.
  async function asUser(userId, method, path, body) {
    const { token } = await createSession(db, userId, { ttlHours: 0.05, ip: null, userAgent: 'telegram bot' });
    try {
      const res = await hono.request(PREFIX + path, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = undefined; }
      return { status: res.status, body: json };
    } finally {
      await destroySession(db, token);
    }
  }
  const telegram = createTelegram({ db, config, log });

  // The object route modules register on.
  const api = { db, config, log, telegram, asUser };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    api[method] = (path, options, handler) => {
      if (typeof options === 'function') [handler, options] = [options, {}];
      const routePath = PREFIX + path;
      hono.on(method.toUpperCase(), routePath, handle(routePath, options, handler));
    };
  }

  api.get('/health', async () => {
    await db.query('select 1');
    return { ok: true };
  });
  for (const routes of [authRoutes, userRoutes, locationRoutes, assetRoutes, engineRoutes, conditionReportRoutes,
    workRoutes, serviceRoutes, incidentRoutes, projectRoutes, dashboardRoutes, auditRoutes, telegramRoutes]) {
    await routes(api);
  }
  // Unknown API paths: still require sign-in, then 404.
  hono.all(`${PREFIX}/*`, handle(`${PREFIX}/*`, {}, async () => { throw notFound('Page'); }));

  return {
    log,
    telegram,
    // Daily Telegram summary (Cloudflare cron trigger, see worker.js).
    daily: () => telegram.daily(asUser),
    fetch: (request, env, ctx) => hono.fetch(request, env, ctx),
    // Test helper: run a request in-process (used by the API tests).
    async inject({ method = 'GET', url, headers = {}, payload }) {
      const init = { method, headers: { ...headers } };
      if (payload !== undefined) {
        init.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
        init.headers['content-type'] ??= 'application/json';
      }
      const res = await hono.request(url, init);
      const body = await res.text();
      return {
        statusCode: res.status,
        headers: Object.fromEntries(res.headers),
        body,
        json: () => JSON.parse(body),
        cookies: res.headers.getSetCookie().map(parseSetCookie),
      };
    },
    close: async () => {},
  };
}

function parseSetCookie(line) {
  const [pair, ...attrs] = line.split(';').map((s) => s.trim());
  const i = pair.indexOf('=');
  const cookie = { name: pair.slice(0, i), value: decodeURIComponent(pair.slice(i + 1)) };
  for (const attr of attrs) {
    const [k, v] = attr.split('=');
    const key = k.toLowerCase();
    if (key === 'httponly') cookie.httpOnly = true;
    else if (key === 'secure') cookie.secure = true;
    else if (key === 'samesite') cookie.sameSite = v;
    else if (key === 'path') cookie.path = v;
    else if (key === 'expires') cookie.expires = new Date(v);
  }
  return cookie;
}
