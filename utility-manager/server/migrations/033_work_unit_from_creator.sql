-- New work goes to its creator's unit unless a unit is chosen (Oct 2026);
-- for a creator without one (the General Manager), the assignee's.
-- Covers work logged on the website or by Telegram, work opened when a
-- genset is set down, and moves recorded from condition reports.
create function work_unit_from_creator() returns trigger language plpgsql as $$
begin
  if new.unit_id is null then
    new.unit_id := coalesce((select unit_id from users where id = new.created_by),
                            (select unit_id from users where id = new.assigned_user_id));
  end if;
  return new;
end $$;
create trigger work_orders_unit_from_creator before insert on work_orders
for each row execute function work_unit_from_creator();
