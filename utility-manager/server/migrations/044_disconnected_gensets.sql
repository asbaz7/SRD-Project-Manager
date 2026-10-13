-- Gensets that were set down only because they are disconnected (Oct 2026
-- genset list, and September condition reports) become 'disconnected', and
-- the planned repair work opened automatically when they were set down is
-- cancelled with a note. Through the status log and work updates, so both
-- keep their history. Runs once; nothing happens to gensets already changed.

create temporary table disconnected_gensets on commit drop as
select s.id as asset_id, s.status_note
  from assets s
  join facilities f on f.id = s.facility_id
  join islands i on i.id = f.island_id
  join atolls a on a.id = i.atoll_id
  join (values
    ('Dh', 'Bandidhoo', '1'), ('Dh', 'Kudahuvadhoo', '4'), ('Dh', 'Maaenboodhoo', '1'), ('Dh', 'Rinbidhoo', '4'),
    ('F', 'Magoodhoo', '1'),
    ('Th', 'Buruni', '1'), ('Th', 'Gaadhifushi', '2'), ('Th', 'Gaadhifushi', '3'), ('Th', 'Guraidhoo', '1'),
    ('Th', 'Kandoodhoo', '3'), ('Th', 'Kinbidhoo', '3'), ('Th', 'Thimarafushi', '1'),
    ('M', 'Dhiggaru', '4'), ('M', 'Raiymandhoo', '4'), ('M', 'Raiymandhoo', '5')
  ) as v(atoll, island, tag) on a.code = v.atoll and i.name = v.island and s.tag = v.tag
 where s.kind = 'genset' and s.active and s.status = 'down' and s.status_note ~* 'disconnect';

-- The open repair work each one got when it was set down.
insert into work_updates (work_id, body, status)
select w.id, 'Cancelled: the genset is disconnected, not broken down (status changed to Disconnected, 13 Oct 2026).', 'cancelled'
  from work_orders w join disconnected_gensets d on d.asset_id = w.asset_id
 where w.status = 'planned' and w.kind = 'repair';

insert into asset_status_log (asset_id, status, note, reported_at)
select asset_id, 'disconnected', status_note, now() from disconnected_gensets;
