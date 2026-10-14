// The monthly genset update (replaces condition report workbooks): for a
// powerhouse, each genset's running hours, condition, fault and service
// flags, entered in the app by technical managers. Paths under /facilities,
// so only technical staff reach them (app.js).
import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { badRequest } from '../errors.js';
import { applyGensetUpdate, expectedMonth, reportState } from '../gensetRecords.js';
import { idParam, one, optText, parse } from '../http.js';
import { localToday } from '../time.js';

const CONDITIONS = ['ok', 'minor_fault', 'major_fault', 'not_running'];
const updateBody = z.object({
  items: z.array(z.object({
    asset_id: z.uuid(),
    total_hours: z.number().nonnegative().max(1_000_000),
    // The hours meter was replaced: a lower reading is allowed.
    meter_replaced: z.boolean().optional(),
    condition: z.enum(CONDITIONS),
    fault: optText(2000),
    needs_overhaul: z.boolean().optional(),
    alt_needs_service: z.boolean().optional(),
  })).min(1).max(40),
});

export default async function gensetUpdateRoutes(app) {
  const { db, config } = app;

  async function powerhouse(facilityId) {
    return one((await db.query(`
      select f.id, f.name, f.kind, f.service, f.reports_from, i.id as island_id, i.name as island_name, i.atoll_id, a.code as atoll_code,
             r.report_month, r.reported_on, r.source, u.full_name as updated_by_name
        from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
        left join powerhouse_reports r on r.facility_id = f.id left join users u on u.id = r.uploaded_by
       where f.id = $1 and f.active`, [facilityId])).rows, 'Powerhouse');
  }
  async function gensets(facilityId) {
    return (await db.query(`
      select s.id, s.tag, s.make_model, s.rated_capacity, s.status,
             c.total_hours, c.condition, c.fault, c.needs_overhaul, c.alt_needs_service, c.report_month, c.reported_on, c.source
        from assets s left join engine_conditions c on c.asset_id = s.id
       where s.facility_id = $1 and s.kind = 'genset' and s.active and s.status <> 'decommissioned'
       order by length(s.tag), s.tag`, [facilityId])).rows;
  }

  // The form: each genset with its last figures.
  app.get('/facilities/:id/genset-update', async (req) => {
    const { id: facilityId } = parse(idParam, req.params);
    const f = await powerhouse(facilityId);
    if (f.service !== 'electricity' || f.kind !== 'powerhouse') throw badRequest('Monthly updates are for powerhouses');
    const today = localToday(config.timezone);
    const expected = expectedMonth(today);
    return { powerhouse: { ...f, state: reportState(f.report_month, expected, f.reports_from) }, today, expected_month: expected, gensets: await gensets(facilityId) };
  });

  app.post('/facilities/:id/genset-update', { preHandler: requireRole('manager') }, async (req) => {
    const { id: facilityId } = parse(idParam, req.params);
    const b = parse(updateBody, req.body);
    const f = await powerhouse(facilityId);
    if (f.service !== 'electricity' || f.kind !== 'powerhouse') throw badRequest('Monthly updates are for powerhouses');
    await assertIslandWrite(db, req.user, { islandId: f.island_id });
    const byId = new Map((await gensets(facilityId)).map((g) => [g.id, g]));
    const seen = new Set();
    const items = b.items.map((it) => {
      const g = byId.get(it.asset_id);
      if (!g) throw badRequest('Each genset must be one of this powerhouse\'s, in use');
      if (seen.has(g.id)) throw badRequest(`Genset ${g.tag} is listed twice`);
      seen.add(g.id);
      if (it.condition !== 'ok' && !it.fault) throw badRequest(`Genset ${g.tag}: say what the fault is`);
      if (g.total_hours != null && it.total_hours < Number(g.total_hours) && !it.meter_replaced) {
        throw badRequest(`Genset ${g.tag}: ${it.total_hours} hours is less than the last reading (${Number(g.total_hours)}). Tick "meter replaced" if it was.`);
      }
      return { ...it, asset: { id: g.id, status: g.status, status_at: null } };
    });
    // The last status time decides whether this update may change the status.
    const { rows: at } = await db.query('select id, status_at from assets where id = any($1::uuid[])', [items.map((i) => i.asset.id)]);
    for (const i of items) i.asset.status_at = at.find((x) => x.id === i.asset.id)?.status_at ?? null;
    const today = localToday(config.timezone);
    const result = await db.tx(req.user.id, (t) => applyGensetUpdate(t, { facilityId, items, userId: req.user.id, today }));
    return { ok: true, ...result };
  });
}
