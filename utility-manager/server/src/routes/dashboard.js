import { z } from 'zod';
import { id, parse } from '../http.js';

// Everything the overview page needs in one call. Optional atoll filter.
export default async function dashboardRoutes(app) {
  const { db } = app;

  app.get('/dashboard', async (req) => {
    const q = parse(z.object({ atoll_id: id.optional() }), req.query);
    const atoll = q.atoll_id ?? null;

    const [services, incidents, projects, down, openIncidents, activeProjects, fuel] = await Promise.all([
      // Facility and asset counts per service.
      db.query(`
        select f.service::text as service,
               count(distinct f.id) as facilities,
               count(distinct f.island_id) as islands,
               count(s.id) as assets,
               count(s.id) filter (where s.status = 'running') as running,
               count(s.id) filter (where s.status = 'standby') as standby,
               count(s.id) filter (where s.status in ('down', 'maintenance')) as down,
               count(s.id) filter (where s.status = 'unknown') as unknown,
               coalesce(sum(s.rated_capacity) filter (where s.kind = 'genset'), 0) as installed_kw,
               coalesce(sum(s.operating_capacity) filter (where s.kind = 'genset' and s.status in ('running', 'standby')), 0) as available_kw
          from facilities f
          join islands i on i.id = f.island_id and i.active
          left join assets s on s.facility_id = f.id and s.active
         where f.active and ($1::uuid is null or i.atoll_id = $1)
         group by f.service`, [atoll]),
      db.query(`
        select x.severity::text as severity, count(*) as n
          from incidents x join islands i on i.id = x.island_id
         where x.status = 'open' and ($1::uuid is null or i.atoll_id = $1)
         group by x.severity`, [atoll]),
      db.query(`
        select count(*) filter (where p.status in ('planned', 'ongoing', 'on_hold')) as active,
               count(*) filter (where p.status = 'ongoing') as ongoing,
               count(*) filter (where p.status in ('planned', 'ongoing', 'on_hold') and p.target_date < current_date) as overdue
          from projects p left join islands i on i.id = p.island_id
         where ($1::uuid is null or i.atoll_id = $1)`, [atoll]),
      // Assets out of service, longest first.
      db.query(`
        select s.id, s.kind, s.tag, s.make_model, s.status, s.status_note, s.status_at, s.rated_capacity, s.capacity_unit,
               f.service, f.name as facility_name, i.id as island_id, i.name as island_name, a.code as atoll_code
          from assets s
          join facilities f on f.id = s.facility_id and f.active
          join islands i on i.id = f.island_id
          join atolls a on a.id = i.atoll_id
         where s.active and s.status in ('down', 'maintenance') and ($1::uuid is null or i.atoll_id = $1)
         order by s.status_at nulls first limit 100`, [atoll]),
      db.query(`
        select x.id, 'INC-' || lpad(x.id::text, 6, '0') as ref, x.title, x.service, x.category, x.severity, x.started_at,
               x.customers_affected, i.id as island_id, i.name as island_name, a.code as atoll_code
          from incidents x join islands i on i.id = x.island_id join atolls a on a.id = i.atoll_id
         where x.status = 'open' and ($1::uuid is null or i.atoll_id = $1)
         order by array_position(array['critical','high','medium','low']::severity_level[], x.severity), x.started_at
         limit 50`, [atoll]),
      // Active projects, overdue first, then by target date.
      db.query(`
        select p.id, 'PRJ-' || lpad(p.id::text, 4, '0') as ref, p.title, p.service, p.status, p.progress_pct,
               p.target_date, (p.target_date < current_date) as overdue,
               i.id as island_id, i.name as island_name, a.code as atoll_code
          from projects p
          left join islands i on i.id = p.island_id
          left join atolls a on a.id = i.atoll_id
         where p.status in ('planned', 'ongoing', 'on_hold') and ($1::uuid is null or i.atoll_id = $1)
         order by (p.target_date < current_date) desc nulls last, p.target_date nulls last, p.id
         limit 20`, [atoll]),
      db.query(`
        select coalesce(sum(f.fuel_capacity_l), 0) as capacity_l,
               count(*) filter (where f.fuel_capacity_l is null) as not_set
          from facilities f join islands i on i.id = f.island_id and i.active
         where f.active and f.service = 'electricity' and f.kind = 'powerhouse'
           and ($1::uuid is null or i.atoll_id = $1)`, [atoll]),
    ]);

    const byService = Object.fromEntries(['electricity', 'water', 'sewerage'].map((s) => [s, {
      facilities: 0, islands: 0, assets: 0, running: 0, standby: 0, down: 0, unknown: 0, installed_kw: 0, available_kw: 0,
    }]));
    for (const row of services.rows) Object.assign(byService[row.service], row);

    return {
      services: byService,
      incidents: {
        open: incidents.rows.reduce((n, r) => n + r.n, 0),
        by_severity: Object.fromEntries(incidents.rows.map((r) => [r.severity, r.n])),
        list: openIncidents.rows,
      },
      projects: { ...projects.rows[0], list: activeProjects.rows },
      fuel_storage: fuel.rows[0],
      assets_down: down.rows,
    };
  });
}
