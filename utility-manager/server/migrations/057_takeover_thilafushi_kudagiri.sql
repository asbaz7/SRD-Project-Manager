-- Two more K islands STELCO serves outside the census's 187 (Oct 2026), as
-- with Vilimalé and Gulhifalhu (migration 056): Thilafushi (industrial;
-- STELCO powerhouse) and Kudagiri (reclaimed picnic island by Gulhifalhu;
-- SRD's powerhouse, water plant and sewerage system). Kudagiri isn't on
-- OpenStreetMap: placed by Thilafushi, about 10.5 km west of Malé.
insert into takeover_islands (atoll_code, name, island_id, counted, electricity_status, water_status, sewerage_status, lat, lon, notes)
select 'K', v.name, (select i.id from islands i join atolls a on a.id = i.atoll_id where a.code = 'K' and i.name = v.name),
       false, 'taken_over', v.water, v.sewerage, v.lat, v.lon, v.notes
  from (values
    ('Thilafushi', null, null, 4.18339, 73.42539, 'Industrial island; not counted in the 187 inhabited islands.'),
    ('Kudagiri', 'taken_over', 'taken_over', 4.16900, 73.43500, 'Picnic island (reclaimed, opened 2023); not counted in the 187 inhabited islands. Position approximate.')
  ) as v(name, water, sewerage, lat, lon, notes)
on conflict (atoll_code, name) do nothing;
