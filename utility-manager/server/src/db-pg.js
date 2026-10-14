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

// Cloudflare Workers: a connection can only be used by the request that
// opened it, so each request (requestScope, set in worker.js) has its own
// small set of connections:
//   * reused: a query takes an idle connection rather than opening one (a page
//     like the dashboard runs about ten queries, each used to connect anew);
//   * at most MAX_OPEN at once, the rest queue: the database's pooler allows
//     few clients (Supabase session mode: 15);
//   * closed when the request ends (connections still in use close as soon as
//     they are handed back);
//   * a connection the pooler refuses ("max clients reached") is tried again
//     shortly. That shows at connect or at the first statement; either way
//     nothing has run yet, so trying again is safe.
// Outside a request scope (scripts, tests) each query opens and closes its own.
const MAX_OPEN = 4;
const POOL_FULL = /max clients reached|too many clients|remaining connection slots/i;
export const requestScope = new AsyncLocalStorage();

// A query error or an error thrown by the app leaves the connection usable;
// a refused or lost connection must not be reused.
const brokenBy = (err) => POOL_FULL.test(err?.message || '')
  || /connection (terminated|ended|closed)|ECONNRESET|EPIPE|ETIMEDOUT|socket/i.test(err?.message || '');

export function connectionLimit(max = MAX_OPEN) {
  const idle = [];
  const waiting = [];   // resolve(client | null): null = a slot freed, connect anew
  let open = 0;
  let closed = false;
  const drop = (client) => { open--; client.end().catch(() => {}); };
  return {
    async take(connect) {
      for (;;) {
        if (idle.length) return idle.pop();
        if (open < max) {
          open++;
          try {
            return await connect();
          } catch (err) {
            open--;
            waiting.shift()?.(null);
            throw err;
          }
        }
        const handed = await new Promise((resolve) => waiting.push(resolve));
        if (handed) return handed;
      }
    },
    give(client, broken = false) {
      if (broken || closed) {
        drop(client);
        waiting.shift()?.(null);
      } else {
        const next = waiting.shift();
        if (next) next(client); else idle.push(client);
      }
    },
    close() {
      closed = true;
      while (idle.length) drop(idle.pop());
    },
  };
}

function perRequestDb(connection) {
  const connect = async () => {
    const client = new pg.Client(connection);
    // Errors also arrive as events (a refused connection, one lost while
    // idle): without a listener they would crash the process. The failing
    // call still rejects, and a broken connection is dropped when handed back.
    client.on('error', () => {});
    try {
      await client.connect();
    } catch (err) {
      client.end().catch(() => {});
      throw err;
    }
    return client;
  };
  const single = { take: connect, give: (client) => { client.end().catch(() => {}); } };

  async function withClient(fn) {
    const scope = requestScope.getStore() || single;
    for (let attempt = 0; ; attempt++) {
      let client;
      try {
        client = await scope.take(connect);
        const result = await fn(client);
        scope.give(client);
        return result;
      } catch (err) {
        if (client) scope.give(client, brokenBy(err));
        if (attempt >= 4 || !POOL_FULL.test(err.message)) throw err;
        await new Promise((r) => setTimeout(r, 150 * 2 ** attempt));
      }
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
