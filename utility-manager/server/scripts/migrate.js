import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const db = await createDb(loadConfig());
const applied = await migrate(db);
console.log(applied.length ? `Applied ${applied.length} migration(s)` : 'Database is up to date');
await db.close();
