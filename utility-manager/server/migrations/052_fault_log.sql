-- Fault log (Oct 2026): every fault logged on a genset, kept for good, with
-- when and by whom it was logged and when, by whom and why it was cleared.
-- The genset's current faults (assets.fault_level / fault_note, migration
-- 051) are the open entry; the log is written by a trigger whenever they
-- change, wherever from (Log fault, the monthly update, Telegram, the
-- assistant, back in service, completed work). Whoever clears it can say why
-- with set_config('app.fault_cleared_by', ...).

create table fault_log (
  id             bigint generated always as identity primary key,
  asset_id       uuid not null references assets(id) on delete cascade,
  level          text not null check (level in ('minor', 'major')),
  note           text,
  logged_at      timestamptz not null default now(),
  logged_by      uuid references users(id) on delete set null,
  cleared_at     timestamptz,
  cleared_by     uuid references users(id) on delete set null,
  cleared_reason text
);
create index fault_log_asset_idx on fault_log (asset_id, logged_at desc);
create index fault_log_open_idx on fault_log (asset_id) where cleared_at is null;

create function log_fault_change() returns trigger language plpgsql as $$
declare
  who uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  open_fault boolean := coalesce(old.fault_level, 'none') in ('minor', 'major');
  now_fault boolean := coalesce(new.fault_level, 'none') in ('minor', 'major');
begin
  if new.fault_level is not distinct from old.fault_level and new.fault_note is not distinct from old.fault_note then
    return null;
  end if;
  if open_fault then
    update fault_log
       set cleared_at = now(), cleared_by = who,
           cleared_reason = case when now_fault then 'Replaced by a newer fault'
                                 else coalesce(nullif(current_setting('app.fault_cleared_by', true), ''), 'Cleared') end
     where asset_id = new.id and cleared_at is null;
  end if;
  if now_fault then
    insert into fault_log (asset_id, level, note, logged_at, logged_by)
    values (new.id, new.fault_level, new.fault_note, coalesce(new.fault_at, now()), coalesce(new.fault_by, who));
  end if;
  return null;
end $$;
create trigger assets_fault_log after update of fault_level, fault_note on assets
for each row execute function log_fault_change();

-- Completed work logged from a fault clears it, saying which work.
create or replace function clear_fault_on_work_done() returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.fault_report_month is not null and new.asset_id is not null then
    perform set_config('app.fault_cleared_by', 'Work WO-' || lpad(new.id::text, 4, '0') || ' completed', true);
    update assets set fault_level = 'none', fault_note = null, fault_at = now(),
                      fault_by = nullif(current_setting('app.user_id', true), '')::uuid
     where id = new.asset_id and fault_level in ('minor', 'major');
    perform set_config('app.fault_cleared_by', '', true);
  end if;
  return null;
end $$;

-- The faults gensets have now start the log.
insert into fault_log (asset_id, level, note, logged_at, logged_by)
select id, fault_level, fault_note, coalesce(fault_at, now()), fault_by
  from assets where fault_level in ('minor', 'major');
