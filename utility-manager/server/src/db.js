// Database access. Production uses node-postgres against PostgreSQL 15+;
// development and tests can use PGlite (Postgres compiled to WASM), so the
// same SQL runs everywhere.
//
// Interface:
//   db.query(sql, params) -> { rows, rowCount }
//   db.exec(sql)          -> runs a multi-statement script
//   db.tx(userId, fn)     -> runs fn(client) in a transaction (client has query/exec); app.user_id is
//                            set so audit triggers record who made the change
//   db.close()

import { createPgDb, parsers } from './db-pg.js';

export async function createDb(config) {
  return config.databaseUrl ? createPgDb(config) : createPgliteDb(config.pgliteDir);
}

async function createPgliteDb(dir) {
  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch {
    throw new Error('DATABASE_URL is not set and PGlite is not installed. Set DATABASE_URL or run `npm install` with dev dependencies.');
  }
  if (dir !== ':memory:') {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(dir, { recursive: true }); // PGlite only creates the last folder
  }
  const pglite = new PGlite({ dataDir: dir === ':memory:' ? undefined : dir, parsers });
  await pglite.waitReady;

  const wrap = (client) => ({
    query: async (sql, params = []) => {
      const r = await client.query(sql, params);
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length };
    },
    exec: (sql) => client.exec(sql),
  });

  return {
    kind: 'pglite',
    query: wrap(pglite).query,
    exec: (sql) => pglite.exec(sql),
    tx: (userId, fn) =>
      pglite.transaction(async (t) => {
        if (userId) await t.query("select set_config('app.user_id', $1, true)", [userId]);
        return fn(wrap(t));
      }),
    withLock: (fn) => fn(),
    close: () => pglite.close(),
  };
}
