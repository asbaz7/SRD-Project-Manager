-- The system is organised into three sections: electricity, water and
-- sewerage. Work orders carry their service so each section shows its own
-- work. Taken from the facility or asset when there is one; island-wide work
-- names its service when it is logged.
alter table work_orders add column service service_type;

update work_orders w set service = f.service
  from facilities f
 where w.service is null and f.id = coalesce(w.facility_id, (select facility_id from assets where id = w.asset_id));

update work_orders set service = 'electricity' where service is null;

alter table work_orders alter column service set not null;
create index work_orders_service_idx on work_orders (service) where status not in ('completed', 'cancelled');
