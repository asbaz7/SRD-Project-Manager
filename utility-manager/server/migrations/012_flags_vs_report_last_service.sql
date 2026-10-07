-- Report flags vs corrections entered on the website (Oct 2026).
--
-- Migration 009 cleared a report's "needs overhaul" / "alternator needs
-- service" only for work dated on or after the report date. But reports are
-- often wrong, and head office corrects them by recording services with
-- their real (earlier) dates; those corrections didn't clear the flag.
--
-- The flag rests on the last service the report knew about. So it now
-- clears when a service is recorded by hand or by a work order (not one taken
-- from a report) that is newer than the report's own last service date (or
-- any such service, if the report gives none).

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
       -- until a newer one than the report knew about is recorded.
       d.needs_overhaul and not exists (
         select 1 from maintenance_events e where e.asset_id = d.id and e.kind in ('overhaul', 'top_overhaul')
            and e.source <> 'report' and e.done_on > coalesce(d.last_overhaul_on, date '-infinity')) as needs_overhaul,
       d.alt_needs_service and not exists (
         select 1 from maintenance_events e where e.asset_id = d.id and e.kind = 'alternator_service'
            and e.source <> 'report' and e.done_on > coalesce(d.last_alt_service_on, date '-infinity')) as alt_needs_service,
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
