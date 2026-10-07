-- Genset moves tracked as work (Oct 2026).
-- A move is a work order of kind 'relocation' with its own stages:
-- planned -> dismantling -> in_transit -> installing -> completed (or
-- on_hold / cancelled). Completing it transfers the asset to the
-- destination (assetMoves.js); asset_moves.work_id links the two.

alter table work_orders drop constraint work_orders_kind_check;
alter table work_orders add constraint work_orders_kind_check check (kind in ('overhaul', 'top_overhaul',
  'alternator_service', 'repair', 'service', 'inspection', 'installation', 'relocation', 'other'));

alter table work_orders drop constraint work_orders_status_check;
alter table work_orders add constraint work_orders_status_check check (status in ('planned', 'in_progress',
  'awaiting_parts', 'on_hold', 'dismantling', 'in_transit', 'installing', 'completed', 'cancelled'));
alter table work_updates drop constraint work_updates_status_check;
alter table work_updates add constraint work_updates_status_check check (status in ('planned', 'in_progress',
  'awaiting_parts', 'on_hold', 'dismantling', 'in_transit', 'installing', 'completed', 'cancelled'));

alter table work_orders
  add column dest_facility_id uuid references facilities(id),
  add column dest_tag text,
  add constraint work_orders_relocation_check check (kind <> 'relocation' or (asset_id is not null and dest_facility_id is not null and dest_tag is not null));
-- One open move per asset.
create unique index work_orders_one_open_move on work_orders (asset_id)
  where kind = 'relocation' and status not in ('completed', 'cancelled');

alter table asset_moves add column work_id bigint references work_orders(id) on delete set null;

-- A completed move is not a maintenance event (the move itself is recorded
-- in asset_moves).
create or replace function log_completed_work() returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and new.asset_id is not null and new.kind <> 'relocation'
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    insert into maintenance_events (asset_id, kind, done_on, running_hours, notes, source, work_id, created_by)
    values (new.asset_id,
            case when new.kind = 'installation' then 'other' else new.kind end,
            coalesce(new.completed_on, current_date),
            (select total_hours from engine_conditions where asset_id = new.asset_id),
            new.title || coalesce(': ' || new.description, ''),
            'work', new.id, nullif(current_setting('app.user_id', true), '')::uuid)
    on conflict (asset_id, kind, done_on) do update
      set work_id = excluded.work_id, notes = coalesce(maintenance_events.notes, excluded.notes);
  end if;
  return new;
end $$;
