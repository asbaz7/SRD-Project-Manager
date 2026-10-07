import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { forbidden, unauthorized } from './errors.js';

const scrypt = promisify(scryptCb);
const KEYLEN = 64;
const COST = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

// ---------------------------------------------------------------------------
// Passwords: scrypt with a per-user salt. Stored as scrypt$N$r$p$salt$hash.
// ---------------------------------------------------------------------------
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), hash.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt') return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(N), r: Number(r), p: Number(p), maxmem: COST.maxmem,
  });
  return timingSafeEqual(actual, expected);
}

// Used to make failed logins for unknown emails take as long as real ones.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword('not-a-real-password');
  await verifyPassword(password, dummyHash);
}

export function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 10) return 'Password must be at least 10 characters';
  if (password.length > 200) return 'Password is too long';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return 'Password must contain letters and numbers';
  return null;
}

// ---------------------------------------------------------------------------
// Sessions: random 256-bit token in an httpOnly cookie (or Bearer header for
// scripts). Only its SHA-256 hash is stored, so a database leak does not leak
// usable sessions.
// ---------------------------------------------------------------------------
export const SESSION_COOKIE = 'srd_session';
const sha256 = (token) => createHash('sha256').update(token).digest();

export async function createSession(db, userId, { ttlHours, ip, userAgent }) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000);
  await db.query(
    `insert into sessions (token_hash, user_id, expires_at, ip, user_agent) values ($1, $2, $3, $4, $5)`,
    [sha256(token), userId, expiresAt, ip, userAgent?.slice(0, 300)],
  );
  return { token, expiresAt };
}

export async function destroySession(db, token) {
  if (token) await db.query('delete from sessions where token_hash = $1', [sha256(token)]);
}

export async function loadSession(db, token) {
  if (!token || token.length > 100) return null;
  const { rows } = await db.query(
    `select u.id, u.email, u.full_name, u.role, u.must_change_password, u.technical, u.permissions,
            s.last_seen_at, s.expires_at,
            coalesce(json_agg(json_build_object('atoll_id', sc.atoll_id, 'island_id', sc.island_id))
                     filter (where sc.id is not null), '[]') as scopes
       from sessions s
       join users u on u.id = s.user_id and u.active
       left join user_scopes sc on sc.user_id = u.id
      where s.token_hash = $1 and s.expires_at > now()
      group by u.id, s.token_hash`,
    [sha256(token)],
  );
  const row = rows[0];
  if (!row) return null;
  // Touch at most every 5 minutes to keep writes low.
  if (Date.now() - new Date(row.last_seen_at).getTime() > 5 * 60_000) {
    db.query('update sessions set last_seen_at = now() where token_hash = $1', [sha256(token)]).catch(() => {});
  }
  const scopes = typeof row.scopes === 'string' ? JSON.parse(row.scopes) : row.scopes;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    // Technical information (engines, condition reports, assets, plants).
    technical: row.role === 'admin' || row.technical,
    // Staff: what this person may do beyond viewing (see allowed()).
    permissions: typeof row.permissions === 'string' ? row.permissions.replace(/[{}]/g, '').split(',').filter(Boolean) : (row.permissions || []),
    mustChangePassword: row.must_change_password,
    scope: {
      region: scopes.some((s) => !s.atoll_id && !s.island_id),
      atollIds: scopes.filter((s) => s.atoll_id).map((s) => s.atoll_id),
      islandIds: scopes.filter((s) => s.island_id).map((s) => s.island_id),
    },
  };
}

export async function purgeExpiredSessions(db) {
  await db.query('delete from sessions where expires_at < now()');
}

// ---------------------------------------------------------------------------
// Authorisation (management staff only)
//   viewer   – read everything
//   manager  – + incidents, asset status, facilities, assets, projects and
//              project updates, island details (all within assigned islands); audit
//   admin    – everything, users, atolls; not limited by scope
// ---------------------------------------------------------------------------
// staff ranks with viewers; what else they may do is per user (allowed()).
const RANK = { viewer: 0, staff: 0, manager: 1, admin: 2 };

export function hasRole(user, minimum) {
  return !!user && RANK[user.role] >= RANK[minimum];
}

// Managers and administrators may do everything of a kind; staff only what
// their permissions list (documents, incidents, work, projects).
export function allowed(user, permission) {
  if (!user) return false;
  if (hasRole(user, 'manager')) return true;
  return user.role === 'staff' && user.permissions.includes(permission);
}

export function requireAllowed(permission, message) {
  return async (req) => {
    if (!req.user) throw unauthorized();
    if (!allowed(req.user, permission)) throw forbidden(message || 'You are not allowed to do this. Ask an administrator.');
  };
}

export function requireRole(minimum) {
  return async (req) => {
    if (!req.user) throw unauthorized();
    if (!hasRole(req.user, minimum)) throw forbidden();
  };
}

export function requireTechnical() {
  return async (req) => {
    if (!req.user) throw unauthorized();
    if (!req.user.technical) throw forbidden('This is technical information, available to technical staff');
  };
}

export function canWriteIsland(user, island) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'viewer') return false;   // staff: by scope, like managers; their permissions limit what
  const { scope } = user;
  return scope.region || scope.atollIds.includes(island.atoll_id) || scope.islandIds.includes(island.id);
}

// Resolve the island behind an island, facility or asset id and check the
// user may write there. Returns the island row ({ id, atoll_id }).
export async function assertIslandWrite(db, user, { islandId, facilityId, assetId }) {
  let sql, id;
  if (assetId) {
    sql = `select i.id, i.atoll_id from assets a join facilities f on f.id = a.facility_id join islands i on i.id = f.island_id where a.id = $1`;
    id = assetId;
  } else if (facilityId) {
    sql = `select i.id, i.atoll_id from facilities f join islands i on i.id = f.island_id where f.id = $1`;
    id = facilityId;
  } else {
    sql = `select id, atoll_id from islands where id = $1`;
    id = islandId;
  }
  const { rows } = await db.query(sql, [id]);
  if (!rows[0]) throw forbidden('That location does not exist');
  if (!canWriteIsland(user, rows[0])) throw forbidden('You can only change records for islands assigned to you');
  return rows[0];
}
