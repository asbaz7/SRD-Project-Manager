-- A report's "needs overhaul" / "alternator needs service" flag clears once
-- that work is recorded (Oct 2026).
--
-- Before: a genset whose August report said "alternator needs service" kept
-- showing "Service needed" after the service was done and recorded in
-- October, until the next report. Same principle as migration 007: the most
-- recent evidence wins. A maintenance record (entered by hand, or created
-- when a work order of that kind is completed) dated on or after the
-- report's "record updated" date clears the flag. The report's original
-- flags stay available as report_needs_overhaul / report_alt_needs_service.

create or replace view engine_current as
with s as (
  select a.id, a.status, a.status_at, a.status_note, c.*,
         (coalesce(c.reported_on, (c.report_month + interval '1 month')::date) + time '08:00')
           at time zone 'Indian/Maldives' as report_at,
         coalesce(c.reported_on, (c.report_month + interval '1 month')::date) as report_date
    from assets a
    left join engine_conditions c on c.asset_id = a.id
   where a.kind = 'genset'
), d as (
  select s.*,
         s.status_at is not null and (s.asset_id is null or s.status_at > s.report_at) as status_newer
    from s
)
select d.id as asset_id,
       d.report_month, d.reported_on, d.status_text, d.fault, d.total_hours, d.hours_since_overhaul,
       d.last_overhaul_on, d.hours_since_valve, d.last_valve_on, d.last_alt_service_on, d.last_battery_on,
       d.max_load_kw, d.capable_kw,
       -- The report's "needs overhaul" / "alternator needs service" stay on
       -- only until that work is recorded on or after the report date.
       d.needs_overhaul and not exists (
         select 1 from maintenance_events e where e.asset_id = d.id and e.kind in ('overhaul', 'top_overhaul')
            and e.done_on >= d.report_date) as needs_overhaul,
       d.alt_needs_service and not exists (
         select 1 from maintenance_events e where e.asset_id = d.id and e.kind = 'alternator_service'
            and e.done_on >= d.report_date) as alt_needs_service,
       d.overhaul_spares_received,
       d.uploaded_by, d.updated_at,
       d.condition as report_condition,
       case
         when d.status_newer and d.status in ('down', 'maintenance') then 'not_running'
         when d.status_newer and d.status in ('running', 'standby') and d.condition = 'not_running' then 'ok'
         else d.condition
       end as condition,
       case
         when d.status_newer and (d.status in ('down', 'maintenance')
                                  or (d.status in ('running', 'standby') and d.condition = 'not_running')) then 'status'
         else 'report'
       end as condition_source,
       case
         when d.status_newer and d.status in ('down', 'maintenance') then d.status_note
         when d.status_newer and d.status in ('running', 'standby') and d.condition = 'not_running'
           then 'Back in service' || coalesce(': ' || d.status_note, '')
       end as condition_note,
       case when d.status_newer then d.status_at end as condition_at,
       d.needs_overhaul as report_needs_overhaul,
       d.alt_needs_service as report_alt_needs_service
  from d
 where d.asset_id is not null or (d.status_newer and d.status in ('down', 'maintenance'));
