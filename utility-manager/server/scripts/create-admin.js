// Creates the first administrator (or resets an existing user's password and
// makes them admin). Usage:
//   npm run create-admin -- admin@example.mv "Full Name"
// The temporary password is printed once; it must be changed at first sign-in.
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../src/auth.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { migrate } from '../src/migrate.js';

const [email, fullName = 'Administrator'] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('Usage: npm run create-admin -- <email> ["Full Name"]');
  process.exit(1);
}

const db = await createDb(loadConfig());
await migrate(db, {});
const password = randomBytes(9).toString('base64url') + '7';
const hash = await hashPassword(password);
await db.query(`
  insert into users (email, full_name, role, password_hash, must_change_password)
  values ($1, $2, 'admin', $3, true)
  on conflict (lower(email)) do update set role = 'admin', active = true, password_hash = excluded.password_hash, must_change_password = true`,
[email.toLowerCase(), fullName, hash]);
console.log(`Administrator ${email} is ready.\nTemporary password: ${password}\nChange it at first sign-in.`);
await db.close();
