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

const NUMERIC = 1700, INT8 = 20, DATE = 1082;

// Numbers as numbers; dates as plain 'YYYY-MM-DD' strings (no timezone shifts).
const parsers = {
  [NUMERIC]: (v) => (v === null ? null : Number.parseFloat(v)),
  [INT8]: (v) => (v === null ? null : Number(v)),
  [DATE]: (v) => v,
};

export async function createDb(config) {
  return config.databaseUrl ? createPgDb(config) : createPgliteDb(config.pgliteDir);
}

async function createPgDb(config) {
  const { default: pg } = await import('pg');
  for (const [oid, fn] of Object.entries(parsers)) pg.types.setTypeParser(Number(oid), fn);
  const pool = new pg.Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolSize,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    idleTimeoutMillis: 30_000,
    statement_timeout: 30_000,
  });
  pool.on('error', (err) => console.error('postgres pool error', err));

  const wrap = (client) => ({
    query: async (sql, params) => {
      const r = await client.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount };
    },
    exec: (sql) => client.query(sql), // simple protocol: multiple statements allowed
  });

  return {
    kind: 'postgres',
    query: wrap(pool).query,
    exec: (sql) => pool.query(sql),
    async tx(userId, fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        if (userId) await client.query("select set_config('app.user_id', $1, true)", [userId]);
        const result = await fn(wrap(client));
        await client.query('commit');
        return result;
      } catch (err) {
        await client.query('rollback').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
    // Serialise migrations across app instances.
    async withLock(fn) {
      const client = await pool.connect();
      try {
        await client.query('select pg_advisory_lock(72817)');
        return await fn();
      } finally {
        await client.query('select pg_advisory_unlock(72817)').catch(() => {});
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

async function createPgliteDb(dir) {
  let PGlite;
  try {
    ({ PGlite } = await import('@electric-sql/pglite'));
  } catch {
    throw new Error('DATABASE_URL is not set and PGlite is not installed. Set DATABASE_URL or run `npm install` with dev dependencies.');
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
