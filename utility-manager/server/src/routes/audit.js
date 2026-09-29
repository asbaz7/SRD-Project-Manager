import { z } from 'zod';
import { requireRole } from '../auth.js';
import { Where, id, pageOf, paging, parse } from '../http.js';

export default async function auditRoutes(app) {
  const { db } = app;

  app.get('/audit', { preHandler: requireRole('manager') }, async (req) => {
    const q = parse(paging.extend({
      entity: z.string().max(60).optional(),
      entity_id: z.string().max(100).optional(),
      user_id: id.optional(),
    }), req.query);
    const w = new Where().add('l.entity = ?', q.entity).add('l.entity_id = ?', q.entity_id).add('l.user_id = ?', q.user_id);
    const { rows } = await db.query(`
      select l.*, u.full_name as user_name, count(*) over () as total_count
        from audit_log l left join users u on u.id = l.user_id
        ${w.sql} order by l.at desc, l.id desc limit ${q.limit} offset ${q.offset}`, w.values);
    return pageOf(rows, q);
  });
}
