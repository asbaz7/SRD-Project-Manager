// Documents sent for signature: the register the admin staff kept as the
// "E-sign status" Microsoft List. Each document has an ordered list of
// signers; status, "completed by" and the last approval date follow from
// who has signed. Signers with a login sign it off themselves; for others
// the sender records it.
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { sendCsv } from '../csv.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { Where, date, id, one, optText, pageOf, paging, parse, serialParam, text } from '../http.js';
import { esc } from '../telegram.js';

export const DEFAULT_TYPES = ['Accommodation form', 'Allowance form', 'Job description', 'Letter', 'Meal form', 'Tender'];
const MAX_FILE = 10 * 1024 * 1024;

const signer = z.object({ user_id: id.nullish(), name: z.string().trim().max(200).nullish() })
  .refine((s) => s.user_id || s.name, 'Each recipient needs a name');
const body = z.object({
  ref: z.string().trim().min(1).max(100),
  doc_type: z.string().trim().min(1).max(100),
  title: optText(300),
  sent_by: id.nullish(),
  sent_by_name: optText(200),
  sent_on: date,
  notes: optText(5000),
  signers: z.array(signer).min(1, 'Add at least one recipient').max(30),
});

const listQuery = paging.extend({
  status: z.enum(['pending', 'completed', 'cancelled', 'all']).default('all'),
  type: z.string().max(100).optional(),
  view: z.enum(['all', 'waiting', 'sent']).default('all'),   // waiting = waiting for my signature
  q: z.string().max(100).optional(),
  format: z.enum(['json', 'csv']).default('json'),
});

const SELECT = `
  select d.*, coalesce(su.full_name, d.sent_by_name) as sent_by_label, cu.full_name as created_by_name,
         (select max(s.signed_on) from document_signers s where s.document_id = d.id) as last_approval_on,
         (select count(*)::int from document_signers s where s.document_id = d.id) as signer_count,
         (select count(*)::int from document_signers s where s.document_id = d.id and s.signed_on is not null) as signed_count,
         (select coalesce(json_agg(json_build_object('id', s.id, 'name', s.name, 'user_id', s.user_id, 'signed_on', s.signed_on)
                   order by s.position), '[]') from document_signers s where s.document_id = d.id) as signers,
         count(*) over () as total_count
    from documents d
    left join users su on su.id = d.sent_by
    left join users cu on cu.id = d.created_by`;

// Who may see a document: its sender, whoever entered it, its recipients
// (to sign it) and administrators. SQL condition on alias d; values from $n.
export function documentVisible(user, n) {
  if (user.role === 'admin') return { sql: 'true', values: [] };
  return {
    sql: `(d.sent_by = $${n} or d.created_by = $${n}
           or exists (select 1 from document_signers vs where vs.document_id = d.id and vs.user_id = $${n}))`,
    values: [user.id],
  };
}

const fixJson = (row) => {
  if (typeof row.signers === 'string') row.signers = JSON.parse(row.signers);
  return row;
};

export default async function documentRoutes(app) {
  const { db, telegram } = app;
  const manager = { preHandler: requireRole('manager') };

  // Editing (details, recipients, signing on someone's behalf, cancelling):
  // the sender, whoever entered it, and administrators.
  async function access(user, docId) {
    const { rows } = await db.query(`
      select d.id, d.ref, d.status, d.sent_by, d.created_by,
             (select s.id from document_signers s where s.document_id = d.id and s.user_id = $2 order by s.position limit 1) as my_signer
        from documents d where d.id = $1`, [docId, user.id]);
    const d = one(rows, 'Document');
    const edit = user.role === 'admin' || d.sent_by === user.id || d.created_by === user.id;
    // Not theirs to see: answer as if it didn't exist.
    if (!edit && !d.my_signer) throw notFound('Document');
    return { ...d, edit };
  }

  async function nameOf(t, userId) {
    const { rows } = await t.query('select full_name from users where id = $1', [userId]);
    if (!rows[0]) throw badRequest('Unknown person');
    return rows[0].full_name;
  }

  // Pending <-> completed follows the signatures; cancelled stays cancelled.
  async function refreshStatus(t, docId) {
    const { rows: [r] } = await t.query(`
      update documents d set status = case
          when (select count(*) from document_signers s where s.document_id = d.id and s.signed_on is null) = 0 then 'completed'
          else 'pending' end
       where d.id = $1 and d.status <> 'cancelled'
         and d.status is distinct from case
          when (select count(*) from document_signers s where s.document_id = d.id and s.signed_on is null) = 0 then 'completed'
          else 'pending' end
      returning d.status`, [docId]);
    return r?.status || null;
  }

  // Who should sign next, so they can be told.
  async function notifyNext(docId) {
    const { rows: [n] } = await db.query(`
      select s.user_id, d.ref, d.doc_type, coalesce(su.full_name, d.sent_by_name) as sender
        from document_signers s join documents d on d.id = s.document_id left join users su on su.id = d.sent_by
       where s.document_id = $1 and s.signed_on is null and d.status = 'pending' order by s.position limit 1`, [docId]);
    if (n?.user_id) {
      await telegram.notifyUser(n.user_id, `✍️ <b>${esc(n.doc_type)} ${esc(n.ref)}</b> is waiting for your signature${n.sender ? ` (sent by ${esc(n.sender)})` : ''}.\n${telegram.link(`/documents/${docId}`, 'Open')}`);
    }
  }

  async function writeSigners(t, docId, signers) {
    // Keep what's already signed for people who stay on the list.
    const { rows: before } = await t.query('select user_id, name, signed_on, recorded_by, recorded_at, note from document_signers where document_id = $1', [docId]);
    const key = (s) => (s.user_id ? `u:${s.user_id}` : `n:${String(s.name).trim().toLowerCase()}`);
    const kept = new Map(before.map((s) => [key(s), s]));
    await t.query('delete from document_signers where document_id = $1', [docId]);
    const seen = new Set();
    let position = 0;
    for (const s of signers) {
      const name = s.user_id ? await nameOf(t, s.user_id) : s.name.trim();
      const k = key({ user_id: s.user_id, name });
      if (seen.has(k)) continue;
      seen.add(k);
      const old = kept.get(k);
      await t.query(`insert into document_signers (document_id, position, user_id, name, signed_on, recorded_by, recorded_at, note)
                     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [docId, ++position, s.user_id ?? null, name, old?.signed_on ?? null, old?.recorded_by ?? null, old?.recorded_at ?? null, old?.note ?? null]);
    }
  }

  app.get('/documents/types', async (req) => {
    const vis = documentVisible(req.user, 1);
    const { rows } = await db.query(`select distinct d.doc_type from documents d where ${vis.sql}`, vis.values);
    return [...new Set([...DEFAULT_TYPES, ...rows.map((r) => r.doc_type)])].sort((a, b) => a.localeCompare(b));
  });

  app.get('/documents', async (req, reply) => {
    const q = parse(listQuery, req.query);
    const vis = documentVisible(req.user, 1);
    const w = new Where(vis.values).raw(vis.sql).add('d.doc_type = ?', q.type)
      .add(`(d.ref ilike ? or d.title ilike ? or d.doc_type ilike ? or d.sent_by_name ilike ? or su.full_name ilike ?
             or exists (select 1 from document_signers s where s.document_id = d.id and s.name ilike ?))`, q.q && `%${q.q}%`);
    if (q.status !== 'all') w.add('d.status = ?', q.status);
    if (q.view === 'waiting') {
      w.add("d.status = 'pending' and exists (select 1 from document_signers s where s.document_id = d.id and s.user_id = ? and s.signed_on is null)", req.user.id);
    } else if (q.view === 'sent') {
      w.add('(d.sent_by = ? or d.created_by = ?)', req.user.id);
    }
    const csv = q.format === 'csv';
    const { rows } = await db.query(`${SELECT} ${w.sql}
      order by (d.status = 'pending') desc, d.sent_on desc, d.id desc
      limit ${csv ? 20000 : q.limit} offset ${csv ? 0 : q.offset}`, w.values);
    rows.forEach(fixJson);
    if (csv) {
      for (const r of rows) {
        r.recipients = r.signers.map((s) => s.name).join('; ');
        r.completed_by = r.signers.filter((s) => s.signed_on).map((s) => s.name).join('; ');
      }
      return sendCsv(reply, 'documents.csv', rows, [
        ['Agreement ID', 'ref'], ['Document type', 'doc_type'], ['Subject', 'title'], ['Sent by', 'sent_by_label'],
        ['Sent date', 'sent_on'], ['Recipients', 'recipients'], ['Completed by', 'completed_by'], ['Status', 'status'],
        ['Last approval date', 'last_approval_on'], ['Last updated', 'updated_at'],
      ]);
    }
    return pageOf(rows, q);
  });

  app.get('/documents/:id', async (req) => {
    const { id: docId } = parse(serialParam, req.params);
    const a = await access(req.user, docId);
    const d = fixJson(one((await db.query(`${SELECT} where d.id = $1`, [docId])).rows, 'Document'));
    delete d.total_count;
    d.signers = (await db.query(`
      select s.*, r.full_name as recorded_by_name from document_signers s left join users r on r.id = s.recorded_by
       where s.document_id = $1 order by s.position`, [docId])).rows;
    d.files = (await db.query(`
      select f.id, f.file_name, f.content_type, f.size_bytes, f.uploaded_at, u.full_name as uploaded_by_name
        from document_files f left join users u on u.id = f.uploaded_by where f.document_id = $1 order by f.uploaded_at`, [docId])).rows;
    d.updates = (await db.query(`
      select x.*, u.full_name as created_by_name from document_updates x left join users u on u.id = x.created_by
       where x.document_id = $1 order by x.created_at desc`, [docId])).rows;
    d.can_edit = a.edit;
    d.my_signer = a.my_signer;
    return d;
  });

  app.post('/documents', manager, async (req, reply) => {
    const b = parse(body, req.body);
    if (!b.sent_by && !b.sent_by_name) b.sent_by = req.user.id;
    const { rows: dup } = await db.query('select id from documents where lower(ref) = lower($1)', [b.ref]);
    if (dup.length) throw conflict(`${b.ref} is already in the register`);
    const docId = await db.tx(req.user.id, async (t) => {
      const { rows } = await t.query(`
        insert into documents (ref, doc_type, title, sent_by, sent_by_name, sent_on, notes, created_by)
        values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [b.ref, b.doc_type, b.title, b.sent_by ?? null, b.sent_by ? null : b.sent_by_name, b.sent_on, b.notes, req.user.id]);
      await writeSigners(t, rows[0].id, b.signers);
      return rows[0].id;
    });
    await notifyNext(docId);
    reply.code(201);
    return fixJson(one((await db.query(`${SELECT} where d.id = $1`, [docId])).rows));
  });

  app.patch('/documents/:id', async (req) => {
    const { id: docId } = parse(serialParam, req.params);
    const a = await access(req.user, docId);
    if (!a.edit) throw forbidden('Only the sender, whoever entered it, or an administrator can change this document');
    const b = parse(body.partial().extend({ status: z.enum(['pending', 'cancelled']).optional() }), req.body);
    if (b.ref) {
      const { rows: dup } = await db.query('select id from documents where lower(ref) = lower($1) and id <> $2', [b.ref, docId]);
      if (dup.length) throw conflict(`${b.ref} is already in the register`);
    }
    await db.tx(req.user.id, async (t) => {
      const fields = {};
      for (const k of ['ref', 'doc_type', 'title', 'sent_on', 'notes', 'status']) if (b[k] !== undefined) fields[k] = b[k];
      // The sender is a user, or a name for someone without a login.
      if (b.sent_by !== undefined || b.sent_by_name !== undefined) {
        fields.sent_by = b.sent_by ?? null;
        fields.sent_by_name = b.sent_by ? null : (b.sent_by_name ?? null);
      }
      const keys = Object.keys(fields);
      if (keys.length) {
        await t.query(`update documents set ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} where id = $1`, [docId, ...keys.map((k) => fields[k])]);
      }
      if (b.signers) await writeSigners(t, docId, b.signers);
      await refreshStatus(t, docId);
    });
    if (b.signers || b.status === 'pending') await notifyNext(docId);
    return { ok: true };
  });

  // Sign: by the signer themself, or recorded by an editor for someone
  // without a login (or on their behalf). undo = take it back (editors).
  app.post('/documents/:id/signers/:signerId/sign', async (req) => {
    const { id: docId, signerId } = parse(z.object({ id: z.coerce.number().int().positive(), signerId: z.coerce.number().int().positive() }), req.params);
    const b = parse(z.object({ signed_on: date.optional(), note: optText(1000), undo: z.boolean().optional() }), req.body || {});
    const a = await access(req.user, docId);
    const { rows: [s] } = await db.query('select * from document_signers where id = $1 and document_id = $2', [signerId, docId]);
    if (!s) throw badRequest('Unknown recipient');
    if (a.status === 'cancelled') throw badRequest('This document was cancelled');
    const self = s.user_id && s.user_id === req.user.id;
    if (!self && !a.edit) throw forbidden('You can only sign for yourself');
    if (b.undo && !a.edit && !self) throw forbidden('Only the sender or an administrator can undo a signature');
    const today = new Date().toLocaleDateString('en-CA', { timeZone: app.config.timezone });
    let status;
    await db.tx(req.user.id, async (t) => {
      await t.query(`update document_signers set signed_on = $2, recorded_by = $3, recorded_at = now(), note = coalesce($4, note) where id = $1`,
        [signerId, b.undo ? null : (b.signed_on || today), req.user.id, b.note ?? null]);
      await t.query('update documents set updated_at = now() where id = $1', [docId]);
      status = await refreshStatus(t, docId);
    });
    if (status === 'completed') {
      const { rows: [d] } = await db.query('select ref, doc_type, sent_by, created_by from documents where id = $1', [docId]);
      const text = `✅ <b>${esc(d.doc_type)} ${esc(d.ref)}</b> is fully signed.\n${telegram.link(`/documents/${docId}`, 'Open')}`;
      await telegram.notifyUser(d.sent_by || d.created_by, text);
    } else if (!b.undo) {
      await notifyNext(docId);
    }
    return { ok: true, status };
  });

  app.post('/documents/:id/updates', async (req, reply) => {
    const { id: docId } = parse(serialParam, req.params);
    const b = parse(z.object({ body: text(5000) }), req.body);
    const a = await access(req.user, docId);
    if (!a.edit && !a.my_signer) throw forbidden('Only the sender and the recipients can post here');
    const { rows } = await db.tx(req.user.id, async (t) => {
      await t.query('update documents set updated_at = now() where id = $1', [docId]);
      return t.query('insert into document_updates (document_id, body, created_by) values ($1, $2, $3) returning *', [docId, b.body, req.user.id]);
    });
    reply.code(201);
    return rows[0];
  });

  app.post('/documents/:id/files', async (req, reply) => {
    const { id: docId } = parse(serialParam, req.params);
    const b = parse(z.object({ file_name: z.string().trim().min(1).max(200), content_type: z.string().max(100).optional(), data: z.string().min(1) }), req.body);
    const a = await access(req.user, docId);
    if (!a.edit && !a.my_signer) throw forbidden('Only the sender and the recipients can add files');
    const bytes = Buffer.from(b.data, 'base64');
    if (!bytes.length) throw badRequest('The file is empty');
    if (bytes.length > MAX_FILE) throw badRequest('Files can be up to 10 MB');
    const { rows } = await db.tx(req.user.id, async (t) => {
      await t.query('update documents set updated_at = now() where id = $1', [docId]);
      return t.query(`insert into document_files (document_id, file_name, content_type, size_bytes, data, uploaded_by)
                      values ($1, $2, $3, $4, $5, $6) returning id, file_name, size_bytes`,
      [docId, b.file_name, b.content_type || 'application/octet-stream', bytes.length, bytes, req.user.id]);
    });
    reply.code(201);
    return rows[0];
  });

  app.get('/documents/:id/files/:fileId', async (req, reply) => {
    const { id: docId, fileId } = parse(z.object({ id: z.coerce.number().int().positive(), fileId: z.coerce.number().int().positive() }), req.params);
    await access(req.user, docId);
    const f = one((await db.query('select file_name, content_type, data from document_files where id = $1 and document_id = $2', [fileId, docId])).rows, 'File');
    reply.header('content-type', f.content_type);
    reply.header('content-disposition', `attachment; filename="${f.file_name.replace(/["\\\r\n]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(f.file_name)}`);
    return reply.send(f.data instanceof Uint8Array ? f.data : new Uint8Array(f.data));
  });

  app.delete('/documents/:id/files/:fileId', async (req) => {
    const { id: docId, fileId } = parse(z.object({ id: z.coerce.number().int().positive(), fileId: z.coerce.number().int().positive() }), req.params);
    const a = await access(req.user, docId);
    if (!a.edit) throw forbidden('Only the sender or an administrator can remove files');
    await db.tx(req.user.id, (t) => t.query('delete from document_files where id = $1 and document_id = $2', [fileId, docId]));
    return { ok: true };
  });
}
