-- Genset condition is derived from engine condition reports.
-- gensets.condition_status / reported_condition / issue_note are kept as a
-- cached copy of each genset's entry in the latest *submitted* monthly report
-- for its powerhouse, so dashboards and summary views keep reading them.
-- Gensets with no submitted report entry are 'unknown'.

create or replace function private.engine_status_condition(status text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case upper(trim(coalesce(status, '')))
    when 'RUNNING; OK' then 'normal'
    when 'RUNNING; MINOR FAULT' then 'attention'
    when 'RUNNING; MAJOR FAULT' then 'critical'
    when 'NOT RUNNING; MAJOR FAULT' then 'critical'
    when 'NOT RUNNING; DISCONNECTED' then 'out_of_service'
    when 'OUT OF SERVICE' then 'out_of_service'
    when 'OTHER / SEE FAULT DETAILS' then 'attention'
    when '' then 'unknown'
    else 'attention'
  end
$$;

create or replace function private.sync_genset_conditions(target_powerhouse uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  with latest as (
    select distinct on (e.genset_id)
      e.genset_id,
      e.engine_status,
      e.fault_details
    from public.engine_condition_entries e
    join public.engine_condition_reports r on r.id = e.report_id
    where r.powerhouse_id = target_powerhouse
      and r.report_status = 'submitted'
    order by e.genset_id, r.report_month desc
  )
  update public.gensets g
  set condition_status = s.condition_status,
      reported_condition = s.engine_status,
      issue_note = s.fault_details,
      updated_at = now()
  from (
    select g2.id,
      private.engine_status_condition(l.engine_status) as condition_status,
      l.engine_status,
      l.fault_details
    from public.gensets g2
    left join latest l on l.genset_id = g2.id
    where g2.powerhouse_id = target_powerhouse
  ) s
  where g.id = s.id
    and (g.condition_status is distinct from s.condition_status
      or g.reported_condition is distinct from s.engine_status
      or g.issue_note is distinct from s.fault_details)
$$;

create or replace function private.engine_reports_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform private.sync_genset_conditions(old.powerhouse_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and (tg_op = 'INSERT' or new.powerhouse_id is distinct from old.powerhouse_id) then
    perform private.sync_genset_conditions(new.powerhouse_id);
  end if;
  return null;
end
$$;

drop trigger if exists engine_condition_reports_sync_gensets on public.engine_condition_reports;
create trigger engine_condition_reports_sync_gensets
after insert or update or delete on public.engine_condition_reports
for each row execute function private.engine_reports_sync_trigger();

-- Statement-level triggers so a multi-genset upsert syncs each powerhouse once.
-- Transition tables cannot be shared across events, hence one trigger per event.
create or replace function private.engine_entries_sync_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_genset_conditions(r.powerhouse_id)
  from public.engine_condition_reports r
  where r.id in (select report_id from new_rows);
  return null;
end
$$;

create or replace function private.engine_entries_sync_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_genset_conditions(r.powerhouse_id)
  from public.engine_condition_reports r
  where r.id in (select report_id from new_rows union select report_id from old_rows);
  return null;
end
$$;

create or replace function private.engine_entries_sync_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.sync_genset_conditions(r.powerhouse_id)
  from public.engine_condition_reports r
  where r.id in (select report_id from old_rows);
  return null;
end
$$;

drop trigger if exists engine_condition_entries_sync_gensets_ins on public.engine_condition_entries;
create trigger engine_condition_entries_sync_gensets_ins
after insert on public.engine_condition_entries
referencing new table as new_rows
for each statement execute function private.engine_entries_sync_insert();

drop trigger if exists engine_condition_entries_sync_gensets_upd on public.engine_condition_entries;
create trigger engine_condition_entries_sync_gensets_upd
after update on public.engine_condition_entries
referencing new table as new_rows old table as old_rows
for each statement execute function private.engine_entries_sync_update();

drop trigger if exists engine_condition_entries_sync_gensets_del on public.engine_condition_entries;
create trigger engine_condition_entries_sync_gensets_del
after delete on public.engine_condition_entries
referencing old table as old_rows
for each statement execute function private.engine_entries_sync_delete();

revoke all on function private.sync_genset_conditions(uuid) from public, anon, authenticated;

-- Backfill: every genset now takes its condition from reports (or 'unknown').
select private.sync_genset_conditions(p.id) from public.powerhouses p;
