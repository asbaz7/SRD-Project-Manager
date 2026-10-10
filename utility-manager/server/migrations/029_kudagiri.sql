-- K. Kudagiri was missing (Oct 2026): Fleet Manager has six gensets there
-- that could not be mirrored. Its powerhouse is added not surveyed (not
-- chased for reports) until its first report or someone sets the month.
insert into islands (atoll_id, name)
select a.id, 'Kudagiri' from atolls a
 where a.code = 'K' and not exists (select 1 from islands i where i.atoll_id = a.id and lower(i.name) = 'kudagiri');

insert into facilities (island_id, service, kind, name)
select i.id, 'electricity', 'powerhouse', 'Kudagiri Powerhouse'
  from islands i join atolls a on a.id = i.atoll_id
 where a.code = 'K' and lower(i.name) = 'kudagiri'
   and not exists (select 1 from facilities f where f.island_id = i.id and f.service = 'electricity' and f.kind = 'powerhouse');
