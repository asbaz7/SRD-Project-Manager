-- A genset going down opens work automatically (Oct 2026).
-- Whenever a genset's status changes to 'down' (website, Telegram /down, or a
-- condition report saying "not running"): if it has no open work (other than
-- a move), a repair work order is opened; otherwise the open work gets an
-- update, so there are no duplicates.

create function open_work_when_down() returns trigger language plpgsql as $$
declare
  open_id bigint;
  f record;
  actor uuid := coalesce(new.status_by, nullif(current_setting('app.user_id', true), '')::uuid);
begin
  if new.kind <> 'genset' or new.status <> 'down' or old.status = 'down' then
    return new;
  end if;
  select w.id into open_id from work_orders w
   where w.asset_id = new.id and w.kind <> 'relocation' and w.status not in ('completed', 'cancelled')
   order by w.created_at desc limit 1;
  if open_id is not null then
    insert into work_updates (work_id, body, created_by)
    values (open_id, 'Reported down' || coalesce(': ' || new.status_note, ''), actor);
  else
    select id, island_id, service into f from facilities where id = new.facility_id;
    insert into work_orders (island_id, facility_id, asset_id, kind, title, description, status, created_by, service)
    values (f.island_id, f.id, new.id, 'repair',
            left('Genset ' || new.tag || ' down' || coalesce(': ' || new.status_note, ''), 200),
            coalesce(new.status_note, 'Reported down') || E'\n\nOpened automatically when the genset was set down.',
            'planned', actor, f.service);
  end if;
  return new;
end $$;

create trigger assets_open_work_when_down after update of status on assets
for each row execute function open_work_when_down();
