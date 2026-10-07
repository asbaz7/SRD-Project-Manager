import { z } from 'zod';
import { requireRole } from '../auth.js';
import { Where, id, pageOf, paging, parse } from '../http.js';
import { projectVisible } from './projects.js';
import { documentVisible } from './documents.js';

// Changes to these are technical information (see TECHNICAL_PREFIXES in app.js).
const TECHNICAL_ENTITIES = ['assets', 'facilities', 'asset_status_log', 'engine_conditions', 'powerhouse_reports',
  'maintenance_events', 'hours_log', 'readings'];

export default async function auditRoutes(app) {
  const { db } = app;

  app.get('/audit', { preHandler: requireRole('manager') }, async (req) => {
    const q = parse(paging.extend({
      entity: z.string().max(60).optional(),
      entity_id: z.string().max(100).optional(),
      user_id: id.optional(),
    }), req.query);
    const w = new Where().add('l.entity = ?', q.entity).add('l.entity_id = ?', q.entity_id).add('l.user_id = ?', q.user_id);
    if (!req.user.technical) w.raw(`l.entity not in (${TECHNICAL_ENTITIES.map((e) => `'${e}'`).join(', ')})`);
    // Document changes only for documents the user can see.
    if (req.user.role !== 'admin') {
      const vis = documentVisible(req.user, w.values.length + 1);
      w.values.push(...vis.values);
      w.raw(`(l.entity not in ('documents', 'document_signers') or exists (
        select 1 from documents d
         where d.id::text = case when l.entity = 'document_signers' then l.changes->>'document_id' else l.entity_id end
           and ${vis.sql}))`);
    }
    // Project changes only for projects the user can see.
    if (req.user.role !== 'admin') {
      const vis = projectVisible(req.user, w.values.length + 1);
      w.values.push(...vis.values);
      w.raw(`(l.entity not in ('projects', 'project_updates', 'project_members') or exists (
        select 1 from projects p
         where p.id::text = case when l.entity = 'project_updates' then l.changes->>'project_id' else l.entity_id end
           and ${vis.sql}))`);
    }
    const { rows } = await db.query(`
      select l.*, u.full_name as user_name, count(*) over () as total_count
        from audit_log l left join users u on u.id = l.user_id
        ${w.sql} order by l.at desc, l.id desc limit ${q.limit} offset ${q.offset}`, w.values);
    return pageOf(rows, q);
  });
}
