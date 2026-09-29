// Cloudflare Workers entry point. Cloudflare serves the built web app
// (web/dist) itself and sends /api/* requests here (see wrangler.jsonc).
//
// Database: a Hyperdrive binding named HYPERDRIVE (recommended), or a
// DATABASE_URL secret. Migrations are not run here: run `npm run migrate`
// against the database when deploying a new version.
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPgDb } from './db-pg.js';
import { createLogger } from './logger.js';

let app;

async function getApp(env) {
  const viaHyperdrive = !!env.HYPERDRIVE?.connectionString;
  const config = loadConfig({
    production: true,
    databaseUrl: env.HYPERDRIVE?.connectionString || env.DATABASE_URL,
    // Hyperdrive already encrypts the link to the database.
    databaseSsl: viaHyperdrive ? false : env.DATABASE_SSL !== 'false',
    logLevel: env.LOG_LEVEL || 'info',
    timezone: env.APP_TIMEZONE || 'Indian/Maldives',
    sessionTtlHours: Number(env.SESSION_TTL_HOURS) || 12,
    webDist: '',
    trustProxy: true,
  });
  if (!config.databaseUrl) throw new Error('Configure a HYPERDRIVE binding or a DATABASE_URL secret');
  // Workers can't share a database connection between requests, so each
  // query opens its own; Hyperdrive keeps that cheap.
  return buildApp({ db: createPgDb(config, { perRequest: true }), config, logger: createLogger(config.logLevel) });
}

export default {
  async fetch(request, env, ctx) {
    try {
      app ??= await getApp(env);
    } catch (err) {
      console.error(JSON.stringify({ level: 'fatal', msg: 'app failed to start', err: { message: err.message, stack: err.stack } }));
      return Response.json({ error: 'The service is unavailable. Please try again shortly.' }, { status: 503 });
    }
    return app.fetch(request, env, ctx);
  },
};
