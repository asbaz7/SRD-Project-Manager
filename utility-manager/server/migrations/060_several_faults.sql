-- A genset can have several faults at once (Oct 2026). Each fault is logged
-- and cleared on its own in fault_log, which is now the record: a new fault
-- no longer replaces the one before. The genset's fault_level / fault_note
-- (migration 051) become a summary of its open faults, kept by a trigger:
-- the worst level, and their descriptions joined. Until now the log was
-- written from changes to those fields (migration 052); that trigger goes.
drop trigger assets_fault_log on assets;
drop function log_fault_change();

create function sync_asset_faults() returns trigger language plpgsql as $$
declare
  aid uuid := coalesce(new.asset_id, old.asset_id);
begin
  update assets a
     set fault_level = case when o.major then 'major' when o.n > 0 then 'minor' else 'none' end,
         fault_note = o.notes,
         fault_at = coalesce(o.latest, now()),
         fault_by = coalesce(o.who, nullif(current_setting('app.user_id', true), '')::uuid)
    from (select count(*) as n, bool_or(level = 'major') as major,
                 string_agg(note, '; ' order by logged_at) as notes, max(logged_at) as latest,
                 (array_agg(logged_by order by logged_at desc))[1] as who
            from fault_log where asset_id = aid and cleared_at is null) o
   where a.id = aid;
  return null;
end $$;
create trigger fault_log_sync after insert or update or delete on fault_log
for each row execute function sync_asset_faults();

-- Work logged for one fault clears that fault when completed; work logged
-- from a fault before this (no fault_id) clears them all, as it did.
alter table work_orders add column fault_id bigint references fault_log(id) on delete set null;

create or replace function clear_fault_on_work_done() returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' and new.asset_id is not null
     and (new.fault_id is not null or new.fault_report_month is not null) then
    update fault_log
       set cleared_at = now(), cleared_by = nullif(current_setting('app.user_id', true), '')::uuid,
           cleared_reason = 'Work WO-' || lpad(new.id::text, 4, '0') || ' completed'
     where asset_id = new.asset_id and cleared_at is null and (new.fault_id is null or id = new.fault_id);
  end if;
  return null;
end $$;
