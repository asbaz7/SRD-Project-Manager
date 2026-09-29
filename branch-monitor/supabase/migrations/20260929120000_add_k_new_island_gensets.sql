-- Gensets for the newly added K atoll islands, from their 2026 engine
-- condition reports. rated_kw = "Engine capacity (kW)"; operating_kw =
-- "Maximum load engine can take (kW)" (blank in the Thilafushi and
-- Gulhifalhu reports).
insert into public.gensets (powerhouse_id, genset_number, model, rated_kw, operating_kw, source_name, source_imported_on)
select p.id, v.genset_number, v.model, v.rated_kw, v.operating_kw, 'Engine condition report 2026', date '2026-09-29'
from (values
  ('Villingili', '1', 'CUMMINS KTA-50-G3',   1000, 900),
  ('Villingili', '2', 'CUMMINS KTA-50-GS8',  1287, 1200),
  ('Villingili', '3', 'CUMMINS KTA-50-G3',   1000, 900),
  ('Villingili', '4', 'CUMMINS KTA-50-G3',   1000, 800),
  ('Villingili', '5', 'CUMMINS QSK60-G4',    1600, 1000),
  ('Villingili', '6', 'CUMMINS KTA-38-G5',    880, 750),
  ('Thilafushi', '1', 'CUMMINS KTA50-G3',    1097, null),
  ('Thilafushi', '2', 'CUMMINS KTA38-G5',     880, null),
  ('Thilafushi', '3', 'CUMMINS KTA19-G3',     360, null),
  ('Thilafushi', '4', 'CUMMINS KTA38-G5',     800, null),
  ('Thilafushi', '5', 'CUMMINS KTA50-G3',    1000, null),
  ('Thilafushi', '6', 'CUMMINS KTA50-G3',    1000, null),
  ('Gulhifalhu', '1', 'VOLVO TAD1345GE',      360, null),
  ('Gulhifalhu', '2', 'CUMMINS LTA 10 G3',    200, null),
  ('Gulhifalhu', '3', 'VOLVO TWD1643GE',      613, null),
  ('Gulhifalhu', '4', 'CUMMINS KTA-50-G3',   1000, null),
  ('Gulhifalhu', '5', 'CUMMINS NTA-855-G1B',  347, null),
  ('Huraa',      '1', 'CUMMINS KTA50-G3',    1000, 700),
  ('Huraa',      '2', 'CUMMINS KTA38-G5',     800, 650),
  ('Huraa',      '3', 'CUMMINS KTA38-G5',     800, 450),
  ('Huraa',      '4', 'CUMMINS KTA50-G3',    1000, 750)
) as v(island, genset_number, model, rated_kw, operating_kw)
join public.islands i on i.name = v.island
join public.atolls a on a.id = i.atoll_id and a.code = 'K'
join public.powerhouses p on p.island_id = i.id
on conflict (powerhouse_id, genset_number) do nothing;
