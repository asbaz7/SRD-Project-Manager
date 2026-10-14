-- One current state per genset (Oct 2026): its status (running, standby,
-- down, maintenance, disconnected, retired: is it available?) and its faults
-- (none, minor or major, with a description: is anything wrong?), both kept
-- on the asset and changed by the same people from the same places (status
-- updates, the monthly update, Telegram, the assistant).
--
-- Until now "condition" came from the monthly report and was weighed against
-- the status by whichever was newer (migrations 007-012). Reports are gone,
-- so the engine view no longer compares dates: its condition is a summary of
-- the two (down or maintenance = not running; otherwise the fault level).

alter table assets
  add column fault_level text check (fault_level in ('none', 'minor', 'major')),
  add column fault_note  text,
  add column fault_at    timestamptz,
  add column fault_by    uuid references users(id) on delete set null;

-- Start from today's merged picture: the condition the engine view shows,
-- with the fault from the last monthly record. A genset brought back into
-- service after a "not running" report had its condition shown as OK.
update assets a
   set fault_level = case ec.condition
                       when 'ok' then 'none' when 'minor_fault' then 'minor' when 'major_fault' then 'major'
                       when 'not_running' then case ec.report_condition
                         when 'ok' then 'none' when 'minor_fault' then 'minor' when 'major_fault' then 'major'
                         when 'not_running' then case when ec.fault is not null then 'major' end end
                     end,
       fault_note = case when ec.condition <> 'ok' and coalesce(ec.report_condition, '') <> 'ok' then ec.fault end,
       fault_at = coalesce((ec.reported_on + time '08:00') at time zone 'Indian/Maldives', ec.updated_at),
       fault_by = ec.uploaded_by
  from engine_current ec
 where ec.asset_id = a.id;
update assets set fault_note = null where fault_level = 'none';

drop view engine_current;
create view engine_current as
select a.id as asset_id,
       -- The last monthly record: hours, service dates and flags.
       c.report_month, c.reported_on, c.status_text, c.total_hours, c.hours_since_overhaul,
       c.last_overhaul_on, c.hours_since_valve, c.last_valve_on, c.last_alt_service_on, c.last_battery_on,
       c.max_load_kw, c.capable_kw,
       -- "Needs overhaul" / "alternator needs service" stay on until a newer
       -- service than the record knew about is recorded (migration 012).
       c.needs_overhaul and not exists (
         select 1 from maintenance_events e where e.asset_id = a.id and e.kind in ('overhaul', 'top_overhaul')
            and e.source <> 'report' and e.done_on > coalesce(c.last_overhaul_on, date '-infinity')) as needs_overhaul,
       c.alt_needs_service and not exists (
         select 1 from maintenance_events e where e.asset_id = a.id and e.kind = 'alternator_service'
            and e.source <> 'report' and e.done_on > coalesce(c.last_alt_service_on, date '-infinity')) as alt_needs_service,
       c.overhaul_spares_received,
       c.source, c.uploaded_by, c.updated_at,
       c.condition as report_condition,
       c.needs_overhaul as report_needs_overhaul,
       c.alt_needs_service as report_alt_needs_service,
       -- The genset's faults now.
       a.fault_level, a.fault_note as fault, a.fault_at,
       -- A summary of status and faults, for counts and filters.
       case
         when a.status in ('down', 'maintenance') then 'not_running'
         when a.fault_level = 'major' then 'major_fault'
         when a.fault_level = 'minor' then 'minor_fault'
         when a.fault_level = 'none' then 'ok'
       end as condition
  from assets a
  left join engine_conditions c on c.asset_id = a.id
 where a.kind = 'genset'
   and (c.asset_id is not null or a.fault_level is not null or a.status in ('down', 'maintenance'));

-- Work logged from a fault (Needs attention → Log work) that is completed
-- dealt with it: the genset's faults are cleared (until recorded again).
create function clear_fault_on_work_done() returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.fault_report_month is not null and new.asset_id is not null then
    update assets set fault_level = 'none', fault_note = null, fault_at = now(),
                      fault_by = nullif(current_setting('app.user_id', true), '')::uuid
     where id = new.asset_id and fault_level in ('minor', 'major');
  end if;
  return null;
end $$;
create trigger work_done_clears_fault after update of status on work_orders
for each row execute function clear_fault_on_work_done();
