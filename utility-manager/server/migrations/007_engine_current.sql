-- One answer to "what state is this genset in now?" (Oct 2026).
--
-- A genset has two sources of truth: the monthly condition report (a
-- snapshot as of its "record updated" date) and live status updates (the
-- website or the Telegram bot). Before this, pages showed both side by side,
-- so a genset could read "OK" and "Down" at once.
--
-- Rule: the most recent evidence wins.
--   * Set down / maintenance after the report  -> not_running (source 'status')
--   * Set running / standby after a report that said not_running
--                                              -> ok, back in service (source 'status')
--   * Otherwise                                -> the report's condition
-- A newer report takes over again (the import also updates the live status
-- when the report is newer, see reportImport.js).
--
-- Rows exist for gensets with a report, or with no report but a newer
-- down / maintenance status; others count as "no report".

create view engine_current as
with s as (
  select a.id, a.status, a.status_at, a.status_note, c.*,
         (coalesce(c.reported_on, (c.report_month + interval '1 month')::date) + time '08:00')
           at time zone 'Indian/Maldives' as report_at
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
       d.max_load_kw, d.capable_kw, d.needs_overhaul, d.alt_needs_service, d.overhaul_spares_received,
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
       case when d.status_newer then d.status_at end as condition_at
  from d
 where d.asset_id is not null or (d.status_newer and d.status in ('down', 'maintenance'));
