// Node.js server: the API plus the built web app, on one port.
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { SECURITY_HEADERS, buildApp } from './app.js';
import { purgeExpiredSessions } from './auth.js';
import { loadConfig } from './config.js';
import { createDb } from './db.js';
import { migrate } from './migrate.js';

const config = loadConfig();
const db = await createDb(config);
const app = await buildApp({ db, config });

// Migrations run on start; they are idempotent and lock-protected, so several
// instances starting together is safe.
await migrate(db, app.log);
if (db.kind === 'pglite') app.log.warn(`Using embedded development database at ${config.pgliteDir}. Set DATABASE_URL for production.`);

const site = new Hono();
site.all('/api/*', (c) => app.fetch(c.req.raw, c.env));
if (config.webDist && existsSync(config.webDist)) {
  // serveStatic resolves paths from the working directory.
  const root = relative(process.cwd(), config.webDist) || '.';
  site.use('*', secureHeaders(SECURITY_HEADERS));
  site.use('*', async (c, next) => {
    await next();
    // Asset file names carry a content hash, so they can be cached for good;
    // pages must be re-checked so a new version shows up at once.
    c.header('cache-control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  });
  site.use('*', serveStatic({ root }));
  // Any other path is a page of the single-page app.
  site.get('*', serveStatic({ root, path: 'index.html' }));
}

const sweep = setInterval(() => purgeExpiredSessions(db).catch((err) => app.log.error(err)), 3600_000);
sweep.unref();

const server = serve({ fetch: site.fetch, port: config.port, hostname: config.host }, (info) => {
  app.log.info(`Listening on http://${config.host}:${info.port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    app.log.info(`${signal} received, shutting down`);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
}
