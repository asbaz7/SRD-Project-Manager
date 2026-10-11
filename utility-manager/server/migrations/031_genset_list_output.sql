-- Current output of the F, Dh and Th gensets (Oct 2026 genset list).
--
-- The gensets taken over from Fenaka came in with rated kW and running hours
-- but no status, so they counted for nothing in available capacity. The
-- region's genset list gives what each set delivers now: that becomes its
-- operating (derated) capacity, and its status is set from it:
--   kW > 0            -> running
--   0 / disconnected  -> down
--   not installed yet -> maintenance (installation ongoing)
-- Rows are matched by island and genset number, and by serial where there is
-- one, so a renumbered genset is left alone rather than given another's data.

create temporary table genset_list (atoll text, island text, tag text, serial_no text,
                                    output_kw numeric, status asset_status, note text) on commit drop;
insert into genset_list values
  ('F', 'Bilehdhoo', '1', '41318403', 350, 'running', null),
  ('F', 'Bilehdhoo', '2', '41328881', 350, 'running', null),
  ('F', 'Bilehdhoo', '3', '25492075', 540, 'running', null),
  ('F', 'Dhranboodhoo', '1', '41323124', 190, 'running', null),
  ('F', 'Dhranboodhoo', '2', '87963802', 65, 'running', null),
  ('F', 'Dhranboodhoo', '3', '84575842', 200, 'running', null),
  ('F', 'Feeali', '1', '41311082', 300, 'running', null),
  ('F', 'Feeali', '2', '82339286', 300, 'running', null),
  ('F', 'Feeali', '3', '41295364', 500, 'running', null),
  ('F', 'Magoodhoo', '1', '87895217', null, 'down', 'Disconnected'),
  ('F', 'Magoodhoo', '2', '25468841', 0, 'down', '0 kW output'),
  ('F', 'Magoodhoo', '3', null, 120, 'running', null),
  ('F', 'Magoodhoo', '4', '41256426', 210, 'running', null),
  ('F', 'Magoodhoo', '6', '80195032', 0, 'down', '0 kW output'),
  ('F', 'Magoodhoo', '5', '93944151', 300, 'running', null),
  ('F', 'Nilandhoo', '1', '35481985', 800, 'running', null),
  ('F', 'Nilandhoo', '2', '41302042', 400, 'running', null),
  ('F', 'Nilandhoo', '3', '41333448', 480, 'running', null),
  ('F', 'Nilandhoo', '4', '25387585', 510, 'running', null),
  ('F', 'Nilandhoo', '5', '41399951', null, 'maintenance', 'Not installed yet; installation ongoing'),
  ('F', 'Nilandhoo', '6', '41399955', null, 'maintenance', 'Not installed yet; installation ongoing'),
  ('Dh', 'Bandidhoo', '1', '23219921', null, 'down', 'Disconnected'),
  ('Dh', 'Bandidhoo', '2', '76669969', 250, 'running', null),
  ('Dh', 'Bandidhoo', '3', '80372974', 280, 'running', null),
  ('Dh', 'Bandidhoo', '4', '93944147', 300, 'running', null),
  ('Dh', 'Hulhudheli', '1', '41256094', 200, 'running', null),
  ('Dh', 'Hulhudheli', '2', '41308399', 300, 'running', null),
  ('Dh', 'Hulhudheli', '3', '82340586', 300, 'running', null),
  ('Dh', 'Kudahuvadhoo', '1', '25462665', 600, 'running', null),
  ('Dh', 'Kudahuvadhoo', '2', '41325214', 700, 'running', null),
  ('Dh', 'Kudahuvadhoo', '3', '41256230', 500, 'running', null),
  ('Dh', 'Kudahuvadhoo', '4', '25447217', null, 'down', 'Disconnected'),
  ('Dh', 'Kudahuvadhoo', '5', '25506317', 850, 'running', null),
  ('Dh', 'Maaenboodhoo', '1', '41257713', null, 'down', 'Disconnected'),
  ('Dh', 'Maaenboodhoo', '2', '41311081', 320, 'running', null),
  ('Dh', 'Maaenboodhoo', '3', '41231773', 200, 'running', null),
  ('Dh', 'Maaenboodhoo', '4', '93944307', 300, 'running', null),
  ('Dh', 'Meedhoo', '1', '41209635', 200, 'running', null),
  ('Dh', 'Meedhoo', '2', '25448762', 400, 'running', null),
  ('Dh', 'Meedhoo', '3', '41334580', 414, 'running', null),
  ('Dh', 'Meedhoo', '4', '41399949', 500, 'running', null),
  ('Dh', 'Rinbidhoo', '1', '78745840', 112, 'running', null),
  ('Dh', 'Rinbidhoo', '2', '01D62875199', 122, 'running', null),
  ('Dh', 'Rinbidhoo', '3', '41331759', 130, 'running', null),
  ('Dh', 'Rinbidhoo', '4', '87750866', null, 'down', 'Disconnected'),
  ('Dh', 'Rinbidhoo', '5', '93578236', 200, 'running', null),
  ('Th', 'Buruni', '1', '78746022', null, 'down', 'Disconnected'),
  ('Th', 'Buruni', '2', '84562375', 200, 'running', null),
  ('Th', 'Buruni', '3', '84527911', 110, 'running', null),
  ('Th', 'Buruni', '4', '93578229', 200, 'running', null),
  ('Th', 'Dhiyamigili', '1', '41358218', 160, 'running', null),
  ('Th', 'Dhiyamigili', '2', '41241352', 100, 'running', null),
  ('Th', 'Dhiyamigili', '3', '41302976', 320, 'running', null),
  ('Th', 'Dhiyamigili', '4', '93944332', null, 'maintenance', 'Not installed yet; installation ongoing'),
  ('Th', 'Gaadhifushi', '1', '76715886', 240, 'running', null),
  ('Th', 'Gaadhifushi', '2', '21766573', null, 'down', 'Disconnected'),
  ('Th', 'Gaadhifushi', '3', '78745852', null, 'down', 'Disconnected'),
  ('Th', 'Gaadhifushi', '4', '41308398', 150, 'running', null),
  ('Th', 'Gaadhifushi', '5', '93578221', 200, 'running', null),
  ('Th', 'Guraidhoo', '1', '25462311', null, 'down', 'Disconnected'),
  ('Th', 'Guraidhoo', '2', '41251839', 380, 'running', null),
  ('Th', 'Guraidhoo', '3', '37278471', 420, 'running', null),
  ('Th', 'Guraidhoo', '4', '60521', 680, 'running', null),
  ('Th', 'Hirilandhoo', '1', '25467409', 520, 'running', null),
  ('Th', 'Hirilandhoo', '2', '41190337', 490, 'running', null),
  ('Th', 'Hirilandhoo', '3', '25496204', 600, 'running', null),
  ('Th', 'Kandoodhoo', '1', '78746374', 118, 'running', null),
  ('Th', 'Kandoodhoo', '2', '41318350', 200, 'running', null),
  ('Th', 'Kandoodhoo', '3', '87962963', null, 'down', 'Disconnected'),
  ('Th', 'Kandoodhoo', '4', '93578226', 200, 'running', null),
  ('Th', 'Kinbidhoo', '1', '25473218', 300, 'running', null),
  ('Th', 'Kinbidhoo', '2', '76292131', 240, 'running', null),
  ('Th', 'Kinbidhoo', '3', '78745846', null, 'down', 'Disconnected'),
  ('Th', 'Kinbidhoo', '4', '93944311', 300, 'running', null),
  ('Th', 'Madifushi', '1', '41308402', 265, 'running', null),
  ('Th', 'Madifushi', '2', '80140912', 170, 'running', null),
  ('Th', 'Madifushi', '3', '41332760', 540, 'running', null),
  ('Th', 'Omadhoo', '1', '84573540', 200, 'running', null),
  ('Th', 'Omadhoo', '2', '87961845', 90, 'running', null),
  ('Th', 'Omadhoo', '3', '41326286', 145, 'running', null),
  ('Th', 'Thimarafushi', '1', '9396852', null, 'down', 'Disconnected'),
  ('Th', 'Thimarafushi', '2', '25491852', 650, 'running', null),
  ('Th', 'Thimarafushi', '3', '25474235', 0, 'down', '0 kW output'),
  ('Th', 'Thimarafushi', '4', '41399902', 500, 'running', null),
  ('Th', 'Vandhoo', '1', '84531500', 0, 'down', '0 kW output'),
  ('Th', 'Vandhoo', '2', '82227141', 110, 'running', null),
  ('Th', 'Vandhoo', '3', '41209662', 180, 'running', null),
  ('Th', 'Veymandoo', '1', '41332761', 350, 'running', null),
  ('Th', 'Vilufushi', '1', '41251369', 250, 'running', null),
  ('Th', 'Vilufushi', '2', '41314922', 500, 'running', null),
  ('Th', 'Vilufushi', '3', '41279326', 300, 'running', null),
  ('Th', 'Vilufushi', '4', '25337195', 180, 'running', null)
;

create temporary table genset_list_hits on commit drop as
select a.id, l.output_kw, l.status, l.note
  from genset_list l
  join atolls at on at.code = l.atoll
  join islands i on i.atoll_id = at.id and i.name = l.island
  join facilities f on f.island_id = i.id
  join assets a on a.facility_id = f.id and a.kind = 'genset' and a.tag = l.tag
 where l.serial_no is null or a.serial_no = l.serial_no;

update assets a set operating_capacity = h.output_kw
  from genset_list_hits h
 where a.id = h.id and h.output_kw is not null;

insert into asset_status_log (asset_id, status, note)
select h.id, h.status, coalesce(h.note || ' (Oct 2026 genset list)', 'Oct 2026 genset list')
  from genset_list_hits h join assets a on a.id = h.id
 where a.status = 'unknown';

-- Th. Veymandoo G4 was not on the handover list. Its serial on the genset
-- list (41308398) is already Th. Gaadhifushi G4's, an NTA855, so it is left
-- off until checked on site.
insert into assets (facility_id, kind, tag, make_model, rated_capacity, operating_capacity, capacity_unit,
                    running_hours, notes)
select f.id, 'genset', '4', 'Cummins KTA38-G2', 600, 500, 'kW', 5269,
       'From the Oct 2026 genset list. Serial given there (41308398) is Gaadhifushi G4''s; check on site.'
  from facilities f join islands i on i.id = f.island_id join atolls at on at.id = i.atoll_id
 where at.code = 'Th' and i.name = 'Veymandoo' and f.service = 'electricity' and f.kind = 'powerhouse'
on conflict (facility_id, kind, tag) do nothing;

insert into asset_status_log (asset_id, status, note)
select a.id, 'running', 'Oct 2026 genset list'
  from assets a join facilities f on f.id = a.facility_id join islands i on i.id = f.island_id
  join atolls at on at.id = i.atoll_id
 where at.code = 'Th' and i.name = 'Veymandoo' and a.kind = 'genset' and a.tag = '4' and a.status = 'unknown';

-- Likely duplicates from the handover list: the genset list has one of each.
-- Left for a person to merge on the genset page.
update assets a
   set notes = coalesce(a.notes || ' ', '') || d.note
  from (values ('F', 'Magoodhoo', '7', 'Possible duplicate of G3 (same model and hours); the Oct 2026 genset list has one NT-855-G4.'),
               ('Th', 'Veymandoo', '2', 'Possible duplicate of G5; the Oct 2026 genset list has one KTA50-G8I.'))
       as d(atoll, island, tag, note),
       facilities f, islands i, atolls at
 where f.id = a.facility_id and i.id = f.island_id and at.id = i.atoll_id
   and at.code = d.atoll and i.name = d.island and a.kind = 'genset' and a.tag = d.tag;
