-- Add Villingili and Gulhifalhu to Kaafu (K) atoll, each with a powerhouse.
-- Gensets can be added once their details are known.
insert into public.islands (atoll_id, name, active)
select a.id, v.name, true
from public.atolls a
cross join (values ('Villingili'), ('Gulhifalhu')) as v(name)
where a.code = 'K'
  and not exists (select 1 from public.islands i where i.atoll_id = a.id and i.name = v.name);

insert into public.powerhouses (island_id, name, operational_status, active)
select i.id, i.name || ' Powerhouse', 'operational', true
from public.islands i
join public.atolls a on a.id = i.atoll_id
where a.code = 'K'
  and i.name in ('Villingili', 'Gulhifalhu')
  and not exists (select 1 from public.powerhouses p where p.island_id = i.id);
