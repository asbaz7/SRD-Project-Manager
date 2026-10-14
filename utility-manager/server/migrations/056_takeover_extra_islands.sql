-- Islands STELCO serves that the census doesn't count as inhabited islands
-- of their own (Oct 2026): K. Vilimalé (part of Malé city; SRD's register
-- calls it Villingili) and K. Gulhifalhu (industrial). On the takeover list
-- and the map, but outside the 187: counted = false leaves them out of the
-- totals, the atoll counts and the service counts.
alter table takeover_islands add column counted boolean not null default true;

insert into takeover_islands (atoll_code, name, island_id, counted, electricity_status, lat, lon, notes)
select 'K', v.name, (select i.id from islands i join atolls a on a.id = i.atoll_id where a.code = 'K' and i.name = v.register),
       false, 'taken_over', v.lat, v.lon, v.notes
  from (values
    ('Vilimalé', 'Villingili', 4.17346, 73.48479, 'Part of Malé city; not counted in the 187 inhabited islands.'),
    ('Gulhifalhu', 'Gulhifalhu', 4.17984, 73.47139, 'Industrial island; not counted in the 187 inhabited islands.')
  ) as v(name, register, lat, lon, notes)
on conflict (atoll_code, name) do nothing;
