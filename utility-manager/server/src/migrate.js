import { readdir, readFile } from 'node:fs/promises';

const DIR = new URL('../migrations/', import.meta.url);

// Applies migrations/*.sql in name order, once each, each in its own transaction.
export async function migrate(db, log = console) {
  return db.withLock(async () => {
    await db.exec(`create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )`);
    const { rows } = await db.query('select version from schema_migrations');
    const done = new Set(rows.map((r) => r.version));
    const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(new URL(file, DIR), 'utf8');
      await db.tx(null, async (t) => {
        await t.exec(sql);
        await t.query('insert into schema_migrations (version) values ($1)', [file]);
      });
      log.info?.(`applied migration ${file}`);
      applied.push(file);
    }
    return applied;
  });
}

