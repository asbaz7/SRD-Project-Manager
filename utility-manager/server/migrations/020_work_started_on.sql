-- A work update that moves work into an active state stamps its start date
-- (Oct 2026). Before, only creating work 'in progress' did, so work started
-- through an update (or the status following an update) had no start date.
create or replace function apply_work_update() returns trigger language plpgsql as $$
begin
  if new.status is not null then
    update work_orders w
       set status = new.status,
           started_on = case when new.status in ('in_progress', 'awaiting_parts', 'dismantling', 'in_transit', 'installing', 'completed')
                             then coalesce(w.started_on, current_date) else w.started_on end,
           completed_on = case when new.status = 'completed' then coalesce(w.completed_on, current_date)
                               when new.status = 'cancelled' then w.completed_on
                               else null end
     where w.id = new.work_id;
  end if;
  return new;
end $$;

-- Work already under way without a start date: its first update's date.
update work_orders w set started_on = (select min(u.created_at)::date from work_updates u where u.work_id = w.id)
 where w.started_on is null and w.status not in ('planned', 'cancelled')
   and exists (select 1 from work_updates u where u.work_id = w.id);
