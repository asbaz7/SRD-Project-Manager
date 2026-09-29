import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { SESSION_COOKIE, loadSession } from './auth.js';
import { errorHandler, forbidden, unauthorized } from './errors.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import locationRoutes from './routes/locations.js';
import assetRoutes from './routes/assets.js';
import readingRoutes from './routes/readings.js';
import incidentRoutes from './routes/incidents.js';
import projectRoutes from './routes/projects.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import auditRoutes from './routes/audit.js';

const PUBLIC_ROUTES = new Set(['/api/v1/auth/login', '/api/v1/health']);
const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildApp({ db, config, logger = true }) {
  const app = Fastify({
    logger: logger && { level: config.logLevel, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    trustProxy: config.trustProxy,
    bodyLimit: 5 * 1024 * 1024, // CSV imports
  });

  app.decorate('db', db);
  app.decorate('config', config);
  app.decorateRequest('user', null);
  app.setErrorHandler(errorHandler);

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  });
  await app.register(rateLimit, { global: false });

  await app.register(async (api) => {
    // Identify the caller from the session cookie or a Bearer token.
    api.addHook('onRequest', async (req) => {
      const header = req.headers.authorization;
      const bearer = header?.startsWith('Bearer ') ? header.slice(7) : null;
      const token = bearer || req.cookies[SESSION_COOKIE];
      req.user = await loadSession(db, token);
      req.viaCookie = !bearer && !!req.user;

      const path = req.routeOptions.url;
      if (PUBLIC_ROUTES.has(path)) return;
      if (!req.user) throw unauthorized();

      // Cookie-authenticated writes must come from our own pages (CSRF defence
      // on top of SameSite cookies).
      if (req.viaCookie && UNSAFE.has(req.method)) {
        const origin = req.headers.origin;
        const own = [`${req.protocol}://${req.host}`, ...config.allowedOrigins];
        if (origin && !own.includes(origin)) throw forbidden('Cross-site request blocked');
      }
      // A temporary password must be replaced before anything else.
      if (req.user.mustChangePassword && !['/api/v1/auth/password', '/api/v1/auth/me', '/api/v1/auth/logout'].includes(path)) {
        throw forbidden('Please change your temporary password first');
      }
    });
    api.addHook('onSend', async (req, reply, payload) => {
      reply.header('cache-control', 'no-store');
      return payload;
    });

    api.get('/health', async () => {
      await db.query('select 1');
      return { ok: true };
    });

    for (const routes of [authRoutes, userRoutes, locationRoutes, assetRoutes, readingRoutes,
      incidentRoutes, projectRoutes, dashboardRoutes, reportRoutes, auditRoutes]) {
      await api.register(routes);
    }
    api.all('/*', async () => { throw Object.assign(new Error('Not found'), { statusCode: 404 }); });
  }, { prefix: '/api/v1' });

  // The built web app (single-page app) is served from the same origin.
  if (existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist, wildcard: false, maxAge: '1h' });
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found' });
      return reply.header('cache-control', 'no-cache').sendFile('index.html');
    });
  }

  return app;
}
