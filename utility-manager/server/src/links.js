// Links to files kept in Microsoft 365 (OneDrive / SharePoint): the system
// stores no files, only these links, on projects, documents and surveys.
// Opening one takes the person to Excel / Word / PowerPoint online, where
// it is edited; who may open it is set by its sharing in Microsoft 365.
import { z } from 'zod';
import { notFound } from './errors.js';
import { optText, parse } from './http.js';

export const LINK_TABLES = {
  project: { table: 'project_links', column: 'project_id' },
  document: { table: 'document_links', column: 'document_id' },
  survey: { table: 'survey_links', column: 'survey_id' },
};

const linkBody = z.object({
  url: z.string().trim().max(2000).url().refine((u) => u.startsWith('https://'), 'must start with https://'),
  title: optText(200),
});
const linkParams = z.object({ id: z.coerce.number().int().positive(), linkId: z.coerce.number().int().positive() });

// A link's title when none is given: the file name in the address if there
// is one (SharePoint and OneDrive links often carry it), else the site.
export function linkTitle(url) {
  const u = new URL(url);
  const decode = (x) => { try { return decodeURIComponent(x); } catch { return x; } };
  const named = [...u.pathname.split('/'), u.searchParams.get('file') || ''].map(decode).reverse().find((x) => /\.[a-z0-9]{2,5}$/i.test(x));
  return (named || u.hostname).slice(0, 200);
}

export async function loadLinks(db, kind, ownerId) {
  const { table, column } = LINK_TABLES[kind];
  return (await db.query(`
    select l.id, l.title, l.url, l.added_at, u.full_name as added_by_name
      from ${table} l left join users u on u.id = l.added_by where l.${column} = $1 order by l.added_at`, [ownerId])).rows;
}

// POST {base}/links and DELETE {base}/links/:linkId, where base has :id.
// canEdit(req, ownerId) throws (403 / 404) when the person may not change
// the owner's links.
export function linkRoutes(app, kind, base, canEdit) {
  const { db } = app;
  const { table, column } = LINK_TABLES[kind];

  app.post(`${base}/links`, async (req, reply) => {
    const { id: ownerId } = parse(z.object({ id: z.coerce.number().int().positive() }), req.params);
    const b = parse(linkBody, req.body);
    await canEdit(req, ownerId);
    const { rows } = await db.tx(req.user.id, (t) => t.query(
      `insert into ${table} (${column}, title, url, added_by) values ($1, $2, $3, $4) returning id, title, url, added_at`,
      [ownerId, b.title || linkTitle(b.url), b.url, req.user.id]));
    reply.code(201);
    return rows[0];
  });

  app.delete(`${base}/links/:linkId`, async (req) => {
    const { id: ownerId, linkId } = parse(linkParams, req.params);
    await canEdit(req, ownerId);
    const { rowCount } = await db.tx(req.user.id, (t) => t.query(`delete from ${table} where id = $1 and ${column} = $2`, [linkId, ownerId]));
    if (!rowCount) throw notFound('Link');
    return { ok: true };
  });
}
