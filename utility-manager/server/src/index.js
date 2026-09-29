import { buildApp } from './app.js';
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

const sweep = setInterval(() => purgeExpiredSessions(db).catch((err) => app.log.error(err)), 3600_000);
sweep.unref();

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    app.log.info(`${signal} received, shutting down`);
    await app.close();
    await db.close();
    process.exit(0);
  });
}

await app.listen({ port: config.port, host: config.host });
