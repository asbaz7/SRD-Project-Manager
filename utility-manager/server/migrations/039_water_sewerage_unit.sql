-- Water and Sewerage Unit (Oct 2026). The water and sewerage work imported
-- from the department's fault log (WSD fault numbers) belongs to it.
insert into units (name, sort_order) values ('Water and Sewerage Unit', 6) on conflict (name) do nothing;

update work_orders
   set unit_id = (select id from units where name = 'Water and Sewerage Unit')
 where external_ref like 'Z-B/F-%' and unit_id is null;
