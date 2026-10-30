// Monthly updates for water plants and sewerage systems (migration 064):
// per asset its status, running hours and fault, and for a water plant the
// water produced. Paths under /facilities and /services, so only technical
// staff reach them (app.js). Last month's update is due by the 10th, as
// the gensets' (expectedMonth).
import { z } from 'zod';
import { assertIslandWrite, requireRole } from '../auth.js';
import { badRequest } from '../errors.js';
import { SETTABLE_STATUSES } from '../domain.js';
import { expectedMonth } from '../gensetRecords.js';
import { idParam, one, optText, parse } from '../http.js';
import { localToday } from '../time.js';

const body = z.object({
  produced_m3: z.number().nonnegative().max(100_000_000).nullish(),
  note: optText(2000),
  items: z.array(z.object({
    asset_id: z.uuid(),
    status: z.enum(SETTABLE_STATUSES).optional(),
    running_hours: z.number().nonnegative().max(1_000_000).nullish(),
    fault: optText(2000),
  })).max(100),
});

export default async function plantUpdateRoutes(app) {
  const { db, config } = app;
  const today = () => localToday(config.timezone);
  const thisMonth = () => `${today().slice(0, 7)}-01`;

  async function plant(facilityId) {
    const f = one((await db.query(`
      select f.id, f.name, f.kind, f.service, i.id as island_id, i.name as island_name, i.atoll_id, a.code as atoll_code
        from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
       where f.id = $1 and f.active`, [facilityId])).rows, 'Plant');
    if (!['water', 'sewerage'].includes(f.service)) throw badRequest('Monthly plant updates are for water and sewerage plants');
    return f;
  }

  // Each plant of a service with its last update, and what is due.
  app.get('/services/:service/updates', async (req) => {
    const { service } = parse(z.object({ service: z.enum(['water', 'sewerage']) }), req.params);
    const { atoll_id: atollId } = parse(z.object({ atoll_id: z.uuid().optional() }), req.query);
    const expected = expectedMonth(today());
    const { rows } = await db.query(`
      select f.id as facility_id, f.name, f.kind, i.id as island_id, i.name as island_name, i.atoll_id, a.code as atoll_code,
             (select count(*)::int from assets s where s.facility_id = f.id and s.active and s.status <> 'decommissioned') as asset_count,
             u.month, u.produced_m3, u.updated_at, uu.full_name as updated_by_name
        from facilities f join islands i on i.id = f.island_id join atolls a on a.id = i.atoll_id
        left join lateral (select * from plant_updates p where p.facility_id = f.id order by p.month desc limit 1) u on true
        left join users uu on uu.id = u.updated_by
       where f.active and i.active and a.active and f.service = $1 and ($2::uuid is null or i.atoll_id = $2)
       order by a.code, i.name, f.name`, [service, atollId ?? null]);
    const plants = rows.map((r) => ({ ...r, state: r.month && r.month >= expected ? 'up_to_date' : r.month ? 'missing' : 'never' }));
    return { expected_month: expected, this_month: thisMonth(), due: plants.filter((p) => p.state !== 'up_to_date').length, plants };
  });

  // The form: the plant, this month's figures if any, each asset with its last.
  app.get('/facilities/:id/plant-update', async (req) => {
    const { id: facilityId } = parse(idParam, req.params);
    const f = await plant(facilityId);
    const month = thisMonth();
    const { rows: [current] } = await db.query('select produced_m3, note from plant_updates where facility_id = $1 and month = $2', [facilityId, month]);
    const { rows: assets } = await db.query(`
      select s.id, s.kind, s.tag, s.make_model, s.rated_capacity, s.capacity_unit, s.status, s.status_note, s.running_hours,
             now_.status as month_status, now_.running_hours as month_hours, now_.fault as month_fault,
             last.month as last_month, last.running_hours as last_hours, last.fault as last_fault
        from assets s
        left join plant_asset_updates now_ on now_.asset_id = s.id and now_.month = $2
        left join lateral (select * from plant_asset_updates p where p.asset_id = s.id and p.month < $2 order by p.month desc limit 1) last on true
       where s.facility_id = $1 and s.active and s.status <> 'decommissioned'
       order by s.kind, length(s.tag), s.tag`, [facilityId, month]);
    return { plant: f, month, current: current || null, assets };
  });

  app.post('/facilities/:id/plant-update', { preHandler: requireRole('manager') }, async (req) => {
    const { id: facilityId } = parse(idParam, req.params);
    const b = parse(body, req.body);
    const f = await plant(facilityId);
    await assertIslandWrite(db, req.user, { islandId: f.island_id });
    const ids = new Set((await db.query("select id from assets where facility_id = $1 and active and status <> 'decommissioned'", [facilityId])).rows.map((r) => r.id));
    for (const it of b.items) if (!ids.has(it.asset_id)) throw badRequest('Each asset must be one of this plant\'s, in use');
    const month = thisMonth();
    await db.tx(req.user.id, async (t) => {
      await t.query(`insert into plant_updates (facility_id, month, produced_m3, note, updated_by) values ($1, $2, $3, $4, $5)
                     on conflict (facility_id, month) do update set produced_m3 = excluded.produced_m3, note = excluded.note,
                       updated_by = excluded.updated_by, updated_at = now()`,
      [facilityId, month, f.service === 'water' ? b.produced_m3 ?? null : null, b.note, req.user.id]);
      for (const it of b.items) {
        const { rows: [a] } = await t.query('select status from assets where id = $1', [it.asset_id]);
        await t.query(`insert into plant_asset_updates (asset_id, month, status, running_hours, fault, updated_by) values ($1, $2, $3, $4, $5, $6)
                       on conflict (asset_id, month) do update set status = excluded.status, running_hours = excluded.running_hours,
                         fault = excluded.fault, updated_by = excluded.updated_by, updated_at = now()`,
        [it.asset_id, month, it.status ?? a.status, it.running_hours ?? null, it.fault, req.user.id]);
        if (it.running_hours != null) await t.query('update assets set running_hours = $2 where id = $1', [it.asset_id, it.running_hours]);
        // A changed status goes through the status log, as any status change.
        if (it.status && it.status !== a.status) {
          await t.query('insert into asset_status_log (asset_id, status, note, reported_by) values ($1, $2, $3, $4)',
            [it.asset_id, it.status, it.fault || `Monthly update ${month.slice(0, 7)}`, req.user.id]);
        }
      }
    });
    return { ok: true, month };
  });
}
