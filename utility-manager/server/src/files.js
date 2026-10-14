// Uploaded files (project files, document files, survey photos and files).
//
// On Cloudflare the files themselves live in R2 (the FILES bucket, see
// wrangler.jsonc); the database keeps a row per file with its name, type,
// size, who uploaded it and `storage_key`, the object's key in the bucket.
// Without a bucket (Node.js, development, tests) the bytes stay in the row's
// `data` column, as before. Both kinds of row can be read, so nothing has to
// be moved when switching (migration 047).
//
//   const files = createFiles(db, bucket)
//   files.save(t, table, owner, { name, type, bytes, userId })  -> row (inside a transaction)
//   files.read(table, owner, fileId)                           -> { file_name, content_type, body } | 404
//   files.readAll(table, owner, { currentOnly })              -> [{ file_name, bytes }]
//   files.removed(rows)                                         -> deletes the objects of deleted rows
//
// `table` is one of FILE_TABLES; `owner` is { column, id }, e.g.
// { column: 'project_id', id: 12 }.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { badRequest, notFound } from './errors.js';

export const MAX_FILE = 10 * 1024 * 1024;

// An upload: JSON with the file as base64.
export const uploadBody = z.object({
  file_name: z.string().trim().min(1).max(200),
  content_type: z.string().max(100).optional(),
  data: z.string().min(1),
});
export function decodeUpload(b) {
  const bytes = Buffer.from(b.data, 'base64');
  if (!bytes.length) throw badRequest('The file is empty');
  if (bytes.length > MAX_FILE) throw badRequest('Files can be up to 10 MB');
  return { name: b.file_name, type: b.content_type || 'application/octet-stream', bytes };
}

// Send a file as a download (or, for pictures when asked, shown in place).
export function sendFile(reply, f, { inline = false } = {}) {
  reply.header('content-type', f.content_type);
  reply.header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${f.file_name.replace(/["\\\r\n]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.file_name)}`);
  return reply.send(f.body);
}

export const FILE_TABLES = ['project_files', 'document_files', 'survey_files'];
const check = (table) => {
  if (!FILE_TABLES.includes(table)) throw new Error(`Not a file table: ${table}`);
};
const asBytes = (data) => (data instanceof Uint8Array ? data : new Uint8Array(data));

export function createFiles(db, bucket, log) {
  return {
    inBucket: !!bucket,

    // Store the bytes, then the row (in the caller's transaction `t`). If the
    // row can't be written the object is removed again.
    // `extra`: more columns for the row, e.g. { group_id, version } (fixed
    // names from the caller, never user input).
    async save(t, table, owner, { name, type, bytes, userId }, extra = {}) {
      check(table);
      const key = bucket ? `${table.replace('_files', '')}/${owner.id}/${randomUUID()}` : null;
      if (bucket) await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
      try {
        const cols = Object.keys(extra);
        const { rows } = await t.query(
          `insert into ${table} (${owner.column}, file_name, content_type, size_bytes, data, storage_key, uploaded_by${cols.map((c) => `, ${c}`).join('')})
           values ($1, $2, $3, $4, $5, $6, $7${cols.map((_, i) => `, $${i + 8}`).join('')}) returning id, file_name, size_bytes`,
          [owner.id, name, type, bytes.length, bucket ? null : bytes, key, userId, ...Object.values(extra)]);
        return rows[0];
      } catch (err) {
        if (bucket) await bucket.delete(key).catch(() => {});
        throw err;
      }
    },

    // One file, streamed from the bucket (or from the row).
    async read(table, owner, fileId) {
      check(table);
      const { rows } = await db.query(
        `select file_name, content_type, data, storage_key from ${table} where id = $1 and ${owner.column} = $2`, [fileId, owner.id]);
      const f = rows[0];
      if (!f) throw notFound('File');
      if (!f.storage_key) return { file_name: f.file_name, content_type: f.content_type, body: asBytes(f.data) };
      const object = bucket && await bucket.get(f.storage_key);
      if (!object) throw notFound('File');
      return { file_name: f.file_name, content_type: f.content_type, body: object.body };
    },

    // Every file of one owner, as bytes (for a ZIP).
    // currentOnly: project files, leaving out older versions.
    async readAll(table, owner, { currentOnly = false } = {}) {
      check(table);
      const { rows } = await db.query(
        `select file_name, data, storage_key from ${table} where ${owner.column} = $1${currentOnly ? ' and current' : ''} order by uploaded_at`, [owner.id]);
      return Promise.all(rows.map(async (f) => {
        if (!f.storage_key) return { file_name: f.file_name, bytes: asBytes(f.data) };
        const object = bucket && await bucket.get(f.storage_key);
        if (!object) throw notFound('File');
        return { file_name: f.file_name, bytes: new Uint8Array(await object.arrayBuffer()) };
      }));
    },

    // After rows are deleted (`... returning storage_key`): remove their
    // objects. A failure leaves an unused object behind, never a broken row.
    async removed(rows) {
      const keys = rows.map((r) => r.storage_key).filter(Boolean);
      if (!keys.length || !bucket) return;
      for (let i = 0; i < keys.length; i += 1000) {
        await bucket.delete(keys.slice(i, i + 1000))
          .catch((err) => log?.error({ err: { message: err.message }, keys: keys.length }, 'file objects not deleted'));
      }
    },
  };
}

// A bucket kept in memory, with R2's interface: for tests.
export function memoryBucket() {
  const objects = new Map();
  return {
    objects,
    async put(key, bytes, options) { objects.set(key, { bytes: asBytes(bytes), contentType: options?.httpMetadata?.contentType }); },
    async get(key) {
      const o = objects.get(key);
      if (!o) return null;
      return { body: new Blob([o.bytes]).stream(), arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.byteLength) };
    },
    async delete(keys) { for (const k of [].concat(keys)) objects.delete(k); },
  };
}
