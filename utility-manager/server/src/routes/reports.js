import { z } from 'zod';
import { sendCsv } from '../csv.js';
import { badRequest } from '../errors.js';
import { date, id, parse, service } from '../http.js';

const monthly = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
  service,
  atoll_id: id.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
const trend = z.object({
  metric: z.string().max(60),
  from: date,
  to: date,
  facility_id: id.optional(),
  island_id: id.optional(),
  atoll_id: id.optional(),
});

// Derived performance indicators per service, from aggregated metrics.
const KPIS = {
  electricity: [
    ['sfc_kwh_per_l', 'Specific fuel consumption (kWh/L)', (v) => ratio(v.gross_generation_kwh, v.fuel_consumed_l)],
    ['aux_pct', 'Auxiliary consumption (%)', (v) => pct(v.aux_consumption_kwh, v.gross_generation_kwh)],
    ['solar_pct', 'Solar share (%)', (v) => pct(v.solar_generation_kwh, (v.gross_generation_kwh ?? 0) + (v.solar_generation_kwh ?? 0))],
  ],
  water: [
    ['kwh_per_m3', 'Energy per m³ (kWh/m³)', (v) => ratio(v.water_energy_kwh, v.water_produced_m3)],
    ['nrw_pct', 'Produced but not supplied (%)', (v) => pct((v.water_produced_m3 ?? 0) - (v.water_supplied_m3 ?? 0), v.water_produced_m3)],
  ],
  sewerage: [
    ['kwh_per_m3', 'Energy per m³ pumped (kWh/m³)', (v) => ratio(v.sewer_energy_kwh, v.sewage_pumped_m3)],
  ],
};
const ratio = (a, b) => (a != null && b ? round(a / b, 3) : null);
const pct = (a, b) => (a != null && b ? round((100 * a) / b, 1) : null);
const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

export default async function reportRoutes(app) {
  const { db } = app;

  // Monthly operations report: one row per facility, one column per metric,
  // aggregated per the metric's rule (sum / max / avg / last), plus KPIs.
  // This is the table the monthly Excel returns used to be built from.
  app.get('/reports/monthly', async (req, reply) => {
    const q = parse(monthly, req.query);
    const start = `${q.month}-01`;
    const [{ rows: metrics }, { rows }] = await Promise.all([
      db.query('select code, name, unit, aggregation from metrics where service = $1 and active order by sort_order', [q.service]),
      db.query(`
        with agg as (
          select r.facility_id, r.metric,
                 case m.aggregation
                   when 'sum' then sum(r.value)
                   when 'max' then max(r.value)
                   when 'min' then min(r.value)
                   when 'avg' then round(avg(r.value), 2)
                   when 'last' then (array_agg(r.value order by r.reading_date desc))[1]
                 end as value
            from readings r join metrics m on m.code = r.metric
           where r.reading_date >= $1::date and r.reading_date < $1::date + interval '1 month'
           group by r.facility_id, r.metric, m.aggregation
        ), days as (
          select facility_id, count(distinct reading_date) as days_reported
            from readings
           where reading_date >= $1::date and reading_date < $1::date + interval '1 month'
           group by facility_id
        ), inc as (
          select facility_id, count(*) as incidents,
                 sum(extract(epoch from (coalesce(resolved_at, now()) - started_at)) / 3600) filter (where category = 'outage') as outage_hours
            from incidents
           where started_at >= $1::date and started_at < $1::date + interval '1 month' and service = $2
           group by facility_id
        )
        select f.id as facility_id, a.code as atoll_code, i.name as island_name, f.name as facility_name,
               coalesce(d.days_reported, 0) as days_reported,
               coalesce(inc.incidents, 0) as incidents, round(coalesce(inc.outage_hours, 0)::numeric, 1) as outage_hours,
               coalesce(json_object_agg(agg.metric, agg.value) filter (where agg.metric is not null), '{}') as vals
          from facilities f
          join islands i on i.id = f.island_id
          join atolls a on a.id = i.atoll_id
          left join agg on agg.facility_id = f.id
          left join days d on d.facility_id = f.id
          left join inc on inc.facility_id = f.id
         where f.active and f.service = $2 and ($3::uuid is null or i.atoll_id = $3)
         group by f.id, a.code, i.name, d.days_reported, inc.incidents, inc.outage_hours
         order by a.code, i.name, f.name`, [start, q.service, q.atoll_id ?? null]),
    ]);

    const kpis = KPIS[q.service];
    const out = rows.map((r) => {
      const vals = typeof r.vals === 'string' ? JSON.parse(r.vals) : r.vals;
      for (const k of Object.keys(vals)) vals[k] = vals[k] === null ? null : Number(vals[k]);
      const row = { ...r, values: vals };
      delete row.vals;
      row.kpis = Object.fromEntries(kpis.map(([key, , fn]) => [key, fn(vals)]));
      return row;
    });

    if (q.format === 'csv') {
      return sendCsv(reply, `monthly_${q.service}_${q.month}.csv`, out, [
        ['Atoll', 'atoll_code'], ['Island', 'island_name'], ['Facility', 'facility_name'], ['Days reported', 'days_reported'],
        ...metrics.map((m) => [`${m.name} (${m.unit})`, (r) => r.values[m.code]]),
        ...kpis.map(([key, label]) => [label, (r) => r.kpis[key]]),
        ['Incidents', 'incidents'], ['Outage hours', 'outage_hours'],
      ]);
    }
    return { month: q.month, service: q.service, metrics, kpis: kpis.map(([key, label]) => ({ key, label })), rows: out };
  });

  // Daily series of one metric, for charts.
  app.get('/reports/trend', async (req) => {
    const q = parse(trend, req.query);
    if (q.to < q.from) throw badRequest('"to" must be on or after "from"');
    if ((Date.parse(q.to) - Date.parse(q.from)) / 86400_000 > 731) throw badRequest('At most two years at a time');
    const { rows } = await db.query(`
      select d::date as date,
             (select case m.aggregation when 'max' then max(r.value) when 'avg' then avg(r.value) else sum(r.value) end
                from readings r
                join facilities f on f.id = r.facility_id
                join islands i on i.id = f.island_id
               where r.metric = $1 and r.reading_date = d::date
                 and ($4::uuid is null or r.facility_id = $4)
                 and ($5::uuid is null or f.island_id = $5)
                 and ($6::uuid is null or i.atoll_id = $6)) as value
        from generate_series($2::date, $3::date, interval '1 day') d
        cross join (select aggregation from metrics where code = $1) m
       order by d`, [q.metric, q.from, q.to, q.facility_id ?? null, q.island_id ?? null, q.atoll_id ?? null]);
    return rows;
  });
}
