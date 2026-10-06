// One call per section (electricity, water, sewerage): what it has, what
// needs attention, and its work, incidents and projects.
import { z } from 'zod';
import { id, parse, service } from '../http.js';
import { expectedMonth, reportState } from '../reportImport.js';
import { mvToday } from './engines.js';
import { projectVisible } from './projects.js';

export default async function serviceRoutes(app) {
  const { db, config } = app;

  app.get('/services/:service', async (req) => {
    const { service: svc } = parse(z.object({ service }), req.params);
    const q = parse(z.object({ atoll_id: id.optional() }), req.query);
    const atoll = q.atoll_id ?? null;
    const today = await mvToday(db, config.timezone);
    const expected = expectedMonth(today);
    const scope = '($2::uuid is null or i.atoll_id = $2)';
    const vis = projectVisible(req.user, 3);

    const [summary, capacity, facilities, attention, work, incidents, projects, engines] = await Promise.all([
      db.query(`
        select count(distinct f.id) as facilities, count(distinct f.island_id) as islands, count(s.id) as assets,
               count(s.id) filter (where s.status = 'running') as running,
               count(s.id) filter (where s.status = 'standby') as standby,
               count(s.id) filter (where s.status in ('down', 'maintenance')) as down,
               count(s.id) filter (where s.status = 'unknown') as unknown
          from facilities f
          join islands i on i.id = f.island_id and i.active
          left join assets s on s.facility_id = f.id and s.active
         where f.active and f.service = $1 and ${scope}`, [svc, atoll]),
      db.query(`
        select s.capacity_unit as unit, sum(s.rated_capacity) as rated,
               sum(coalesce(s.operating_capacity, s.rated_capacity)) filter (where s.status in ('running', 'standby')) as available
          from assets s join facilities f on f.id = s.facility_id and f.active join islands i on i.id = f.island_id and i.active
         where s.active and f.service = $1 and s.rated_capacity is not null and ${scope}
         group by s.capacity_unit order by sum(s.rated_capacity) desc`, [svc, atoll]),
      db.query(`
        select f.id, f.name, f.kind, f.fuel_capacity_l, f.water_capacity_m3, i.id as island_id, i.name as island_name,
               a.code as atoll_code, r.report_month,
               count(s.id) as assets,
               count(s.id) filter (where s.status = 'running') as running,
               count(s.id) filter (where s.status in ('down', 'maintenance')) as down,
               count(c.asset_id) filter (where c.condition in ('major_fault', 'not_running')) as serious,
               count(c.asset_id) filter (where c.condition = 'minor_fault') as minor,
               (select count(*) from work_orders w where w.facility_id = f.id and w.status not in ('completed', 'cancelled')) as open_work
          from facilities f
          join islands i on i.id = f.island_id and i.active
          join atolls a on a.id = i.atoll_id
          left join assets s on s.facility_id = f.id and s.active
          left join engine_current c on c.asset_id = s.id
          left join powerhouse_reports r on r.facility_id = f.id
         where f.active and f.service = $1 and ${scope}
         group by f.id, i.id, a.code, r.report_month
         order by a.code, i.name, f.name`, [svc, atoll]),
      // Assets that need someone's attention: out of service, or a serious
      // fault in the latest condition report.
      db.query(`
        select s.id, s.kind, s.tag, s.make_model, s.status, s.status_note, s.status_at,
               c.condition, c.condition_source, c.condition_note, c.condition_at, c.status_text, c.fault, i.id as island_id, i.name as island_name, a.code as atoll_code,
               (select w.title from work_orders w where w.asset_id = s.id and w.status not in ('completed', 'cancelled')
                 order by w.created_at desc limit 1) as work_title
          from assets s
          join facilities f on f.id = s.facility_id and f.active
          join islands i on i.id = f.island_id and i.active
          join atolls a on a.id = i.atoll_id
          left join engine_current c on c.asset_id = s.id
         where s.active and f.service = $1 and ${scope}
           and (s.status in ('down', 'maintenance') or c.condition in ('major_fault', 'not_running'))
         order by (c.condition = 'not_running' or s.status = 'down') desc, a.code, i.name, length(s.tag), s.tag
         limit 100`, [svc, atoll]),
      db.query(`
        select w.id, 'WO-' || lpad(w.id::text, 4, '0') as ref, w.kind, w.title, w.status, w.target_on,
               (w.target_on < current_date) as overdue, i.id as island_id, i.name as island_name, a.code as atoll_code,
               s.id as asset_id, s.tag as asset_tag, s.kind as asset_kind,
               (select u.body from work_updates u where u.work_id = w.id order by u.created_at desc limit 1) as last_update
          from work_orders w
          join islands i on i.id = w.island_id
          join atolls a on a.id = i.atoll_id
          left join assets s on s.id = w.asset_id
         where w.service = $1 and w.status not in ('completed', 'cancelled') and ${scope}
         order by array_position(array['in_progress','awaiting_parts','on_hold','planned'], w.status), w.target_on nulls last
         limit 50`, [svc, atoll]),
      db.query(`
        select x.id, 'INC-' || lpad(x.id::text, 6, '0') as ref, x.title, x.category, x.severity, x.started_at,
               i.id as island_id, i.name as island_name, a.code as atoll_code
          from incidents x join islands i on i.id = x.island_id join atolls a on a.id = i.atoll_id
         where x.service = $1 and x.status = 'open' and ${scope}
         order by array_position(array['critical','high','medium','low']::severity_level[], x.severity), x.started_at
         limit 50`, [svc, atoll]),
      db.query(`
        select p.id, 'PRJ-' || lpad(p.id::text, 4, '0') as ref, p.title, p.status, p.progress_pct, p.target_date,
               (p.target_date < current_date) as overdue, i.id as island_id, i.name as island_name, a.code as atoll_code
          from projects p left join islands i on i.id = p.island_id left join atolls a on a.id = i.atoll_id
         where p.service = $1 and p.status in ('planned', 'ongoing', 'on_hold') and ($2::uuid is null or i.atoll_id = $2)
           and ${vis.sql}
         order by (p.target_date < current_date) desc nulls last, p.target_date nulls last
         limit 20`, [svc, atoll, ...vis.values]),
      svc === 'electricity' ? db.query(`
        select count(*) as total,
               count(*) filter (where c.condition = 'ok') as ok,
               count(*) filter (where c.condition = 'minor_fault') as minor_fault,
               count(*) filter (where c.condition = 'major_fault') as major_fault,
               count(*) filter (where c.condition = 'not_running') as not_running,
               count(*) filter (where c.asset_id is null) as no_report,
               count(*) filter (where c.needs_overhaul or s.next_overhaul_on <= current_date
                                  or (s.next_overhaul_hours is not null and c.total_hours >= s.next_overhaul_hours)) as overhaul_due,
               count(*) filter (where c.alt_needs_service or s.next_alt_service_on <= current_date) as alt_service_due
          from assets s
          join facilities f on f.id = s.facility_id and f.active
          join islands i on i.id = f.island_id and i.active
          left join engine_current c on c.asset_id = s.id
         where s.kind = 'genset' and s.active and f.service = $1 and ${scope}`, [svc, atoll]) : { rows: [] },
    ]);

    for (const f of facilities.rows) f.report_state = f.kind === 'powerhouse' ? reportState(f.report_month, expected) : null;
    const missing = facilities.rows.filter((f) => f.report_state === 'missing' || f.report_state === 'never');
    return {
      service: svc,
      today,
      summary: summary.rows[0],
      capacity: capacity.rows,
      facilities: facilities.rows,
      attention: attention.rows,
      work: work.rows,
      incidents: incidents.rows,
      projects: projects.rows,
      ...(svc === 'electricity' ? {
        engines: engines.rows[0],
        reports: { expected_month: expected, missing: missing.map(({ id: facilityId, island_id, island_name, atoll_code, report_month }) => ({ facility_id: facilityId, island_id, island_name, atoll_code, report_month })) },
      } : {}),
    };
  });
}
