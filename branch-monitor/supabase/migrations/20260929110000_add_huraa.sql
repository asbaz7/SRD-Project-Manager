-- Add Huraa to Kaafu (K) atoll, with a powerhouse.
-- Gensets can be added once their details are known.
insert into public.islands (atoll_id, name, active)
select a.id, 'Huraa', true
from public.atolls a
where a.code = 'K'
  and not exists (select 1 from public.islands i where i.atoll_id = a.id and i.name = 'Huraa');

insert into public.powerhouses (island_id, name, operational_status, active)
select i.id, 'Huraa Powerhouse', 'operational', true
from public.islands i
join public.atolls a on a.id = i.atoll_id
where a.code = 'K'
  and i.name = 'Huraa'
  and not exists (select 1 from public.powerhouses p where p.island_id = i.id);
