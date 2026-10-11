// PostgreSQL via node-postgres. Two connection modes:
//   pooled      – a long-lived pool (Node.js server, the default)
//   perRequest  – a fresh connection per query / transaction, for Cloudflare
//                 Workers, where a connection opened while serving one request
//                 cannot be used by another. Use it behind Hyperdrive (or a
//                 connection pooler) so connecting is cheap.
import { AsyncLocalStorage } from 'node:async_hooks';
import pg from 'pg';

const NUMERIC = 1700, INT8 = 20, DATE = 1082;

// Numbers as numbers; dates as plain 'YYYY-MM-DD' strings (no timezone shifts).
export const parsers = {
  [NUMERIC]: (v) => (v === null ? null : Number.parseFloat(v)),
  [INT8]: (v) => (v === null ? null : Number(v)),
  [DATE]: (v) => v,
};
for (const [oid, fn] of Object.entries(parsers)) pg.types.setTypeParser(Number(oid), fn);

const wrap = (client) => ({
  query: async (sql, params) => {
    const r = await client.query(sql, params);
    return { rows: r.rows, rowCount: r.rowCount };
  },
  exec: (sql) => client.query(sql), // simple protocol: multiple statements allowed
});

async function inTransaction(client, userId, fn) {
  try {
    await client.query('begin');
    if (userId) await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(wrap(client));
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  }
}

export function createPgDb(config, { perRequest = false } = {}) {
  const connection = {
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined,
    statement_timeout: 30_000,
  };
  return perRequest ? perRequestDb(connection) : pooledDb(connection, config.databasePoolSize);
}

function pooledDb(connection, max) {
  const pool = new pg.Pool({ ...connection, max, idleTimeoutMillis: 30_000 });
  pool.on('error', (err) => console.error('postgres pool error', err));
  return {
    kind: 'postgres',
    query: wrap(pool).query,
    exec: (sql) => pool.query(sql),
    async tx(userId, fn) {
      const client = await pool.connect();
      try {
        return await inTransaction(client, userId, fn);
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

// The database's pooler allows few connections at a time (Supabase session
// mode: 15), and a page like the dashboard asks for about ten at once. So
// each request keeps at most MAX_OPEN open, queueing the rest, and a
// connection refused because the pooler is full is tried again shortly.
// The limit is per request (requestScope, set in worker.js): Workers can't
// share waiting promises between requests.
const MAX_OPEN = 4;
const POOL_FULL = /max clients reached|too many clients|remaining connection slots/i;
export const requestScope = new AsyncLocalStorage();

export function connectionLimit(max = MAX_OPEN) {
  let open = 0;
  const waiting = [];
  return {
    acquire: () => (open < max ? (open++, Promise.resolve()) : new Promise((resolve) => waiting.push(resolve))),
    release: () => { const next = waiting.shift(); if (next) next(); else open--; },
  };
}
const unlimited = { acquire: () => Promise.resolve(), release: () => {} };

function perRequestDb(connection) {
  // Behind Hyperdrive a full pooler shows at the first statement rather than
  // at connect; either way nothing has run yet, so trying again is safe.
  async function withClient(fn) {
    const { acquire, release } = requestScope.getStore() || unlimited;
    await acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        const client = new pg.Client(connection);
        try {
          await client.connect();
          return await fn(client);
        } catch (err) {
          if (attempt >= 4 || !POOL_FULL.test(err.message)) throw err;
          await new Promise((r) => setTimeout(r, 150 * 2 ** attempt));
        } finally {
          client.end().catch(() => {});
        }
      }
    } finally {
      release();
    }
  }
  return {
    kind: 'postgres',
    query: (sql, params) => withClient((c) => wrap(c).query(sql, params)),
    exec: (sql) => withClient((c) => c.query(sql)),
    tx: (userId, fn) => withClient((c) => inTransaction(c, userId, fn)),
    withLock: (fn) => fn(),
    close: async () => {},
  };
}
