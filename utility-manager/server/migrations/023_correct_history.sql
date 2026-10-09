-- Records can be corrected after they are written (Oct 2026).
--
-- A completed work order's history entry now follows the work order: moving
-- the work to another engine, changing its type or completion date, or
-- reopening it moves or takes back the entry it created. Before, the entry
-- stayed where it was first written (WO-0005 logged on Dhigurah G2 for work
-- on G3 left 7 Oct in G2's history for good).
--
-- Maintenance records can be edited; the reason is kept on the record, so it
-- shows in the audit trail with the change.

create or replace function log_completed_work() returns trigger language plpgsql as $$
declare
  was boolean := tg_op = 'UPDATE' and old.status = 'completed' and old.asset_id is not null and old.kind <> 'relocation';
  now_done boolean := new.status = 'completed' and new.asset_id is not null and new.kind <> 'relocation';
  ev maintenance_events;
begin
  if was and now_done and old.asset_id = new.asset_id and old.kind = new.kind
     and old.completed_on is not distinct from new.completed_on then
    return new;
  end if;
  if was then
    -- Take back what this work wrote; a record that was already there
    -- (from a report or entered by hand) stays, only unlinked.
    select * into ev from maintenance_events where work_id = old.id and source = 'work' limit 1;
    delete from maintenance_events where work_id = old.id and source = 'work';
    update maintenance_events set work_id = null where work_id = old.id;
  end if;
  if now_done then
    insert into maintenance_events (asset_id, kind, done_on, running_hours, notes, source, work_id, created_by)
    values (new.asset_id,
            case when new.kind = 'installation' then 'other' else new.kind end,
            coalesce(new.completed_on, current_date),
            -- Same engine: keep the hours recorded at completion.
            case when ev.asset_id = new.asset_id then ev.running_hours
                 else (select total_hours from engine_conditions where asset_id = new.asset_id) end,
            coalesce(ev.notes, new.title || coalesce(': ' || new.description, '')),
            'work', new.id,
            coalesce(ev.created_by, nullif(current_setting('app.user_id', true), '')::uuid))
    on conflict (asset_id, kind, done_on) do update
      set work_id = excluded.work_id, notes = coalesce(maintenance_events.notes, excluded.notes);
  end if;
  return new;
end $$;

drop trigger work_orders_log_completed on work_orders;
create trigger work_orders_log_completed after insert or update of status, asset_id, kind, completed_on on work_orders
for each row execute function log_completed_work();

alter table maintenance_events
  add column edit_reason text,
  add column edited_by uuid references users(id),
  add column edited_at timestamptz;
