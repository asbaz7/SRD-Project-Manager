-- Water and sewerage systems, operating licences and island details (Oct 2026).
--
-- From the Water & Sewerage Department files (WSD Islands Master Sheet, the
-- system lists in WSD Fault Logs 2026, Operating Licenses) and the island
-- information sheets for F, Dh and Th:
--   * each island's water plant (RO units with rated / actual output in
--     t/day = m3/day, storage, collection tanks, rainwater plants) and
--     sewerage system (pump stations with pump brand, vacuum stations,
--     treatment plants). Status is 'unknown' until someone sets it;
--   * operating licences: type (P permanent, T temporary, TP), issued,
--     expiry and the department's status, and the handover date;
--   * powerhouse fuel storage (L) where not set, and survey notes.
-- Systems are named as the department codes them (RO-01, ST-01, PS-01...).

alter table facilities drop constraint facilities_kind_check;
alter table facilities add constraint facilities_kind_check
  check (kind in ('powerhouse', 'solar_plant', 'water_plant', 'water_storage', 'sewerage_plant', 'sewerage_system', 'pump_station', 'other'));

alter table facilities
  add column handover_on        date,
  add column licence_type       text,
  add column licence_issued_on  date,
  add column licence_expires_on date,
  add column licence_status     text;

create temporary table wsd_facilities (atoll text, island text, service service_type, kind text, name text, water_m3 numeric,
  commissioned_on date, handover_on date, licence_type text, licence_issued_on date, licence_expires_on date, licence_status text,
  notes text) on commit drop;
insert into wsd_facilities values
  ('ADh', 'Mahibadhoo', 'sewerage', 'sewerage_system', 'Mahibadhoo Sewerage System', null, null, '2019-08-18', 'TP', '2022-07-07', '2023-07-07', 'Expired', 'Gravity sewer
359 house connections, 9 pending
Treatment plant: Aeration System, not operational (Cable and Panel Damaged)'),
  ('Dh', 'Bandidhoo', 'water', 'water_plant', 'Bandidhoo Water Plant', 610, null, '2024-03-03', 'T', '2024-08-29', '2025-08-29', 'Expired', '99 house connections, 65 pending
Daily demand 5 t/day
Monthly consumption 8 t
Active connections 158
Source Borewell
Network pressure 3 bar'),
  ('Dh', 'Bandidhoo', 'sewerage', 'sewerage_system', 'Bandidhoo Sewerage System', null, null, '2024-03-03', 'T', '2024-10-23', '2025-10-23', 'Expired', 'Gravity sewer
101 house connections, 55 pending
Active connections: 158
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: YES'),
  ('Dh', 'Hulhudheli', 'water', 'water_plant', 'Hulhudheli Water Plant', 660, null, '2024-04-24', 'T', '2024-08-29', '2025-08-29', 'Expired', '128 house connections, 15 pending
Daily demand 15 t/day
Monthly consumption 18 t
Active connections 163
Source Borewell'),
  ('Dh', 'Hulhudheli', 'sewerage', 'sewerage_system', 'Hulhudheli Sewerage System', null, null, '2018-01-10', 'P', '2020-01-14', '2055-01-05', 'Change to URA OL', 'Gravity sewer
191 house connections, 3 pending
Active connections: 145
Pumps operational: 9
Outfall pipe: HDPE
Jetting machine: NOT AVAILABLE'),
  ('Dh', 'Kudahuvadhoo', 'water', 'water_plant', 'Kudahuvadhoo Water Plant', 250, null, '2021-03-28', 'TP', '2022-07-07', '2023-07-07', 'Expired', '863 house connections, 77 pending
Daily demand 93 t/day
Monthly consumption 100 t
Active connections 751
Source Borewell
Network pressure 1.9'),
  ('Dh', 'Kudahuvadhoo', 'sewerage', 'sewerage_system', 'Kudahuvadhoo Sewerage System', null, null, '2019-06-23', 'TP', '2022-07-07', '2023-07-07', 'Expired', 'Small bore sewer
650 house connections, 23 pending
Active connections: 661
Pumps operational: 7
Outfall pipe: HDPE'),
  ('Dh', 'Maaenboodhoo', 'sewerage', 'sewerage_system', 'Maaenboodhoo Sewerage System', null, null, '2017-02-14', 'P', '2017-05-10', '2052-05-01', 'Change to URA OL', 'Gravity sewer
188 house connections
Active connections: 188
Pumps operational: 4
Outfall pipe: HDPE Pipe
Jetting machine: YES , Qty: 01'),
  ('Dh', 'Meedhoo', 'water', 'water_plant', 'Meedhoo Water Plant', 540, null, '2024-02-18', 'T', '2024-08-29', '2025-08-29', 'Expired', '231 house connections, 6 pending
RO plants: Both Operational
Membranes: November 2023, No conductivity issues
Boreholes: 02 boreholes, no issues
Services needed: No major services required
Critical spares: Bag filters
Daily demand 23 t/day
Monthly consumption 690 t
Active connections 220
Source Borewaell
Network pressure 3 to 6 bar'),
  ('Dh', 'Meedhoo', 'sewerage', 'sewerage_system', 'Meedhoo Sewerage System', null, null, '2019-07-19', 'TP', '2022-07-07', '2023-07-07', 'Expired', 'Vacuum sewer
226 house connections, 1 pending
Treatment plant: Aeration System, not operational (Components Damaged)
Active connections: 129
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: NO'),
  ('Dh', 'Rinbidhoo', 'water', 'water_plant', 'Rinbidhoo Water Plant', 240, null, '2023-10-30', 'T', '2024-08-29', '2025-08-29', 'Expired', '156 house connections, 3 pending
Daily demand 3 t/day
Monthly consumption 6 t
Active connections 116
Source Borewell
Network pressure Max ( 3 bar )       Min ( 2.2 bar )'),
  ('Dh', 'Rinbidhoo', 'sewerage', 'sewerage_system', 'Rinbidhoo Sewerage System', null, null, '2023-10-30', 'T', '2024-10-23', '2025-10-23', 'Expired', 'Gravity sewer
123 house connections, 3 pending
Active connections: 150
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: Available'),
  ('F', 'Bilehdhoo', 'water', 'water_plant', 'Bilehdhoo Water Plant', 660, null, '2024-02-18', 'T', '2024-08-29', '2025-08-29', 'Expired', '173 house connections, 5 pending
Daily demand 7 t/day
Monthly consumption 10 t
Active connections 170
Source Borewell
Network pressure 2.8 to 5.8 bar'),
  ('F', 'Bilehdhoo', 'sewerage', 'sewerage_system', 'Bilehdhoo Sewerage System', null, null, '2023-07-04', 'T', '2025-12-07', '2026-12-07', 'Valid', 'Gravity sewer
120 house connections, 69 pending
Active connections: 154
Pumps operational: 4
Outfall pipe: PVC
Jetting machine: NO'),
  ('F', 'Dhranboodhoo', 'water', 'water_plant', 'Dhranboodhoo Water Plant', 610, null, '2024-02-15', 'T', '2024-08-29', '2025-08-29', 'Expired', '92 house connections, 2 pending
Daily demand 7 t/day
Monthly consumption 9 t
Active connections 90
Source Borewell'),
  ('F', 'Dhranboodhoo', 'sewerage', 'sewerage_system', 'Dhranboodhoo Sewerage System', null, null, '2024-02-15', 'T', '2024-10-23', '2025-10-23', 'Expired', 'Gravity sewer
42 house connections, 1 pending
Active connections: 60
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: YES'),
  ('F', 'Feeali', 'sewerage', 'sewerage_system', 'Feeali Sewerage System', null, null, '2021-01-31', 'TP', '2022-07-07', '2023-07-07', 'Expired', 'Gravity sewer
250 house connections, 2 pending
Active connections: 254
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: NO'),
  ('F', 'Magoodhoo', 'water', 'water_plant', 'Magoodhoo Water Plant', 400, null, '2022-05-26', 'T', '2025-12-28', '2026-12-28', 'Valid', '168 house connections, 6 pending
RO plants: Both Operational
Membranes: August 2023, no conductivity issue
Boreholes: 2 boreholes in operational status
Services needed: Rainwater plant membranes required asap
Critical spares: Chlorine and rainwater plant membranes
Daily demand 25 t/day
Monthly consumption 35 t
Active connections 100
Source Borewell
Network pressure 1.8'),
  ('F', 'Magoodhoo', 'sewerage', 'sewerage_system', 'Magoodhoo Sewerage System', null, null, '2022-05-26', 'T', '2025-12-28', '2026-12-28', 'Valid', 'Gravity sewer
141 house connections, 4 pending
Active connections: 170
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: YES'),
  ('F', 'Nilandhoo', 'sewerage', 'sewerage_system', 'Nilandhoo Sewerage System', null, null, '2019-06-06', null, null, null, 'Not Applied', 'Vacuum sewer
397 house connections
Treatment plant: Rotating Bio Disc, not operational (Not operational due to high electricity usage)
Active connections: 330
Pumps operational: 3
Outfall pipe: HDPE / UPVC
Jetting machine: NOT AVAILABLE'),
  ('K', 'Kudagiri', 'water', 'water_plant', 'Kudagiri Water Plant', 460, null, null, null, null, null, 'Not Applied', 'RO plants: 1 plant in operation
Membranes: Have not been changed since operation started, No conductivity issues
Boreholes: 2 boreholes, borehole 2 has a leak from flange connection and is not operational as of now
Services needed: Need to change membranes
Critical spares: Membranes'),
  ('K', 'Kudagiri', 'sewerage', 'sewerage_system', 'Kudagiri Sewerage System', null, null, null, null, null, null, null, 'Gravity sewer'),
  ('M', 'Dhiggaru', 'water', 'water_plant', 'Dhiggaru Water Plant', 200, null, null, null, null, null, null, null),
  ('M', 'Dhiggaru', 'sewerage', 'sewerage_system', 'Dhiggaru Sewerage System', null, null, null, null, null, null, null, null),
  ('M', 'Kolhufushi', 'water', 'water_plant', 'Kolhufushi Water Plant', 770, null, null, null, null, null, null, null),
  ('M', 'Kolhufushi', 'sewerage', 'sewerage_system', 'Kolhufushi Sewerage System', null, null, null, null, null, null, null, null),
  ('M', 'Maduvvari', 'water', 'water_plant', 'Maduvvari Water Plant', 660, null, null, null, null, null, null, null),
  ('M', 'Maduvvari', 'sewerage', 'sewerage_system', 'Maduvvari Sewerage System', null, null, null, null, null, null, null, null),
  ('M', 'Mulah', 'water', 'water_plant', 'Mulah Water Plant', 300, null, null, null, null, null, null, 'RO plants: 1 plant in operation, RO 2 has a plc issue caused by power issue.
Membranes: 1 year. Conductivity at 700+
Boreholes: 1 borehole in good condition
Services needed: RO plant 2 has to be serviced
Critical spares: Stock available'),
  ('M', 'Mulah', 'sewerage', 'sewerage_system', 'Mulah Sewerage System', null, null, null, null, null, null, null, null),
  ('M', 'Muli', 'water', 'water_plant', 'Muli Water Plant', 1140, null, null, null, null, null, null, 'RO plants: Both Operational
Membranes: Never changed since operation started
Boreholes: Both are in operational status
Services needed: Chlorine tank foot valve needs to be changed
Critical spares: Chlorine tank foot valve'),
  ('M', 'Muli', 'sewerage', 'sewerage_system', 'Muli Sewerage System', null, null, null, null, null, null, null, null),
  ('Th', 'Buruni', 'water', 'water_plant', 'Buruni Water Plant', 10, null, null, null, null, null, null, 'RO plants: No / Only standalone plant
Membranes: Changed in 1st week of Ramadan / No Conductivity issue
Boreholes: Water intake from beach side / Condition of pipe line is good / No borehole
Services needed: Plant area is not lightened and very dark
Critical spares: No critical requests'),
  ('Th', 'Buruni', 'sewerage', 'sewerage_system', 'Buruni Sewerage System', null, null, '2016-10-25', 'P', '2016-11-24', '2051-11-16', 'Change to URA OL', 'Gravity sewer
115 house connections, 2 pending
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: NO'),
  ('Th', 'Dhiyamigili', 'water', 'water_plant', 'Dhiyamigili Water Plant', 50, null, null, null, null, null, null, 'RO plants: No RO Plant / Rainwater plant operational
Membranes: Not changed
Boreholes: No borehole
Services needed: Not reuqired
Critical spares: No critical spares + 01 distribution pump taken by Azzrova Malves (Contractor) and not returned'),
  ('Th', 'Dhiyamigili', 'sewerage', 'sewerage_system', 'Dhiyamigili Sewerage System', null, null, '2017-07-31', 'P', '2019-02-19', '2054-02-10', 'Change to URA OL', 'Gravity sewer
108 house connections
Active connections: 147
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: Yes'),
  ('Th', 'Gaadhifushi', 'water', 'water_plant', 'Gaadhifushi Water Plant', 300, null, '2023-07-11', null, null, null, 'Reapply', 'Licence: When asked for updates on the application, URA informed that they did not receive a response for the 1st application comments set on 27th January 2024. Document shared again on 28th December 2025. Need to re-submit the application along with the monitoring data of the sewerage system during the expired temporary license and the updated house connection list.
231 house connections, 15 pending
RO plants: Both Operational
Membranes: Operation starts from last year + membrane not changed + 745 conductivity
Boreholes: 02 borehole in good condition
Services needed: Not required, Valves and pipe line repaired recently
Critical spares: Not required, Membrane required in next couple of months
Active connections 10
Source borewell
Network pressure 2.5bar'),
  ('Th', 'Gaadhifushi', 'sewerage', 'sewerage_system', 'Gaadhifushi Sewerage System', null, null, '2023-07-11', null, null, null, 'Reapply', 'Gravity sewer
52 house connections
Active connections: 55qty
Pumps operational: 4
Outfall pipe: HDPE SDR 17
Jetting machine: yes'),
  ('Th', 'Guraidhoo', 'water', 'water_plant', 'Guraidhoo Water Plant', 144, null, '2021-03-04', 'TP', '2022-07-07', '2023-07-07', 'Expired', '268 house connections, 15 pending
RO plants: Single Plant island + operational
Membranes: Not changed + conductivity sensor not working
Boreholes: 02 borehole operational but elbow and pipe line damaged in borehole 2, Feed issue due to one borehole. low feed
Services needed: Borehole Pipe line service + Distribution 1 pump seal leakage
Critical spares: Fiitings for borehole + TDS or conductivity sensor or meter
Daily demand 21 t/day
Monthly consumption 630 t
Source Borewell
Network pressure 2.5 - 2.8 bar'),
  ('Th', 'Guraidhoo', 'sewerage', 'sewerage_system', 'Guraidhoo Sewerage System', null, null, '2019-07-01', 'TP', '2022-07-07', '2023-07-07', 'Expired', 'Small bore sewer
305 house connections, 6 pending
Pumps operational: 6
Outfall pipe: HDPE
Jetting machine: No'),
  ('Th', 'Hirilandhoo', 'water', 'water_plant', 'Hirilandhoo Water Plant', 1000, null, '2024-10-21', 'T', '2025-03-19', '2026-03-19', 'Expired', '318 house connections, 20 pending
RO plants: Both Operational
Membranes: Recently handover
Boreholes: Good Condition
Services needed: HP pump seal leakage + chlorin mixing pump temperature issue
Daily demand 34 t/day
Monthly consumption 55 t
Active connections 308
Source Borewell
Network pressure 3.0 bar'),
  ('Th', 'Hirilandhoo', 'sewerage', 'sewerage_system', 'Hirilandhoo Sewerage System', null, null, '2024-10-21', 'T', '2025-03-19', '2026-03-19', 'Expired', 'Gravity sewer
252 house connections, 21 pending
Active connections: 331
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: yes'),
  ('Th', 'Kandoodhoo', 'water', 'water_plant', 'Kandoodhoo Water Plant', null, null, null, null, null, null, null, null),
  ('Th', 'Kinbidhoo', 'water', 'water_plant', 'Kinbidhoo Water Plant', 650, null, '2022-11-24', null, null, null, 'Applied', 'Licence: When asked for updates on the application, URA informed that they did not receive a response for the 1st application comments set on 25th May 2023.  Document shared again on 8th September 2025. Need to resubmit application when water quality report is ready.
151 house connections, 6 pending
RO plants: 01 plant non operational, Reject Valve issue in 2nd plant. New valve received but not installed
Membranes: Membrane changed before 9 months and No conductivity issue
Boreholes: 02 borehole operational
Services needed: Replace reject valve
Daily demand 9 t/day
Monthly consumption 270 t
Source Borewell
Network pressure 3.2 bar'),
  ('Th', 'Kinbidhoo', 'sewerage', 'sewerage_system', 'Kinbidhoo Sewerage System', null, null, '2022-11-24', null, null, null, 'Applied', 'Gravity sewer
139 house connections, 8 pending
Active connections: 139
Outfall pipe: HDPE
Jetting machine: Available'),
  ('Th', 'Madifushi', 'water', 'water_plant', 'Madifushi Water Plant', 20, null, null, null, null, null, null, null),
  ('Th', 'Madifushi', 'sewerage', 'sewerage_system', 'Madifushi Sewerage System', null, null, '2016-10-25', 'P', '2016-11-24', '2051-11-16', 'Change to URA OL', 'Gravity sewer
262 house connections, 1 pending
Active connections: 253
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: No'),
  ('Th', 'Omadhoo', 'water', 'water_plant', 'Omadhoo Water Plant', null, null, null, null, null, null, null, 'RO plants: No RO Plant / Rain water plant operational
Critical spares: Ball valve, elbow, pipes'),
  ('Th', 'Thimarafushi', 'water', 'water_plant', 'Thimarafushi Water Plant', 900, null, '2019-03-17', 'P', '2019-10-09', '2054-09-30', 'Expired', '222 house connections, 2 pending
Daily demand 45 t/day
Monthly consumption 1350 t
Source Borewell
Network pressure 1.5bar'),
  ('Th', 'Thimarafushi', 'sewerage', 'sewerage_system', 'Thimarafushi Sewerage System', null, null, '2019-07-06', 'T', '2019-08-05', '2020-08-04', 'Change to URA OL', 'Gravity sewer
325 house connections, 5 pending
Treatment plant: Aeration System, not operational (Spares not available)
Outfall pipe: HDPE
Jetting machine: NO'),
  ('Th', 'Vandhoo', 'water', 'water_plant', 'Vandhoo Water Plant', 260, null, '2024-11-13', 'T', '2025-03-19', '2026-03-19', 'Expired', '94 house connections
RO plants: 2 Plant operational but plant 2 feed issue
Membranes: recently handover, not changed
Boreholes: Both boreholes Operational
Critical spares: Glyzerine required
Daily demand 5 t/day
Monthly consumption 150 t
Source Borewell
Network pressure 2.5bar'),
  ('Th', 'Vandhoo', 'sewerage', 'sewerage_system', 'Vandhoo Sewerage System', null, null, '2024-11-13', 'T', '2025-03-19', '2026-03-19', 'Expired', 'Gravity sewer
64 house connections, 15 pending
Pumps operational: 4
Outfall pipe: HDPE
Jetting machine: NO'),
  ('Th', 'Veymandoo', 'water', 'water_plant', 'Veymandoo Water Plant', 600, null, '2023-06-21', 'T', '2026-02-26', '2027-02-26', 'Valid', '277 house connections, 20 pending
RO plants: 1 plant not operational due to membrane issues, requested and processing
Membranes: High Conductivity
Boreholes: Both boreholes in good condition
Services needed: No, Membrane request
Critical spares: Membrane, Sand filter materials, UV light, Tank inner paint
Active connections 281
Source BoreWell
Network pressure 1.6 to 1.9 BAR'),
  ('Th', 'Veymandoo', 'sewerage', 'sewerage_system', 'Veymandoo Sewerage System', null, null, '2023-01-24', 'T', '2026-02-26', '2027-02-26', 'Valid', 'Gravity sewer
470 house connections, 29 pending
Active connections: 281
Pumps operational: 6
Outfall pipe: HDPE
Jetting machine: Available'),
  ('Th', 'Vilufushi', 'water', 'water_plant', 'Vilufushi Water Plant', 1540, null, '2019-02-13', 'P', '2019-01-14', '2054-01-05', 'Expired', '203 house connections, 4 pending
RO plants: 2 RO Plant not operational due to CAT Pump issues
Membranes: February 2025 membrane changed
Boreholes: 2 borehole in good  condition
Services needed: CAT Pump required service,
Critical spares: Sneider relay in booster pump, Pressure gauges
Daily demand 13 t/day
Monthly consumption 390 t
Active connections 248
Source ebara
Network pressure 1.5'),
  ('Th', 'Vilufushi', 'sewerage', 'sewerage_system', 'Vilufushi Sewerage System', null, null, '2019-07-01', 'TP', '2022-07-07', '2023-07-07', 'Expired', 'Gravity sewer
309 house connections, 1 pending
Treatment plant: Rotating Bio Disc, not operational (Spares not available)
Active connections: 322
Pumps operational: 8
Outfall pipe: HDPE
Jetting machine: Gully Bowser 2');

insert into facilities (island_id, service, kind, name, water_capacity_m3, commissioned_on, handover_on,
                        licence_type, licence_issued_on, licence_expires_on, licence_status, notes)
select i.id, w.service, w.kind, w.name, w.water_m3, w.commissioned_on, w.handover_on,
       w.licence_type, w.licence_issued_on, w.licence_expires_on, w.licence_status, w.notes
  from wsd_facilities w join atolls a on a.code = w.atoll join islands i on i.atoll_id = a.id and i.name = w.island
on conflict (island_id, name) do nothing;

create temporary table wsd_assets (atoll text, island text, facility text, kind text, tag text, make_model text,
  rated numeric, operating numeric, unit text, notes text) on commit drop;
insert into wsd_assets values
  ('ADh', 'Mahibadhoo', 'Mahibadhoo Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('ADh', 'Mahibadhoo', 'Mahibadhoo Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('ADh', 'Mahibadhoo', 'Mahibadhoo Sewerage System', 'pump', 'PS-03', 'Grundfos pump station', null, null, null, null),
  ('ADh', 'Mahibadhoo', 'Mahibadhoo Sewerage System', 'other', 'STP-01', 'Sewage treatment plant (Aeration System)', null, null, null, 'Cable and Panel Damaged'),
  ('Dh', 'Bandidhoo', 'Bandidhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 40, null, 'm3/day', null),
  ('Dh', 'Bandidhoo', 'Bandidhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 40, null, 'm3/day', null),
  ('Dh', 'Bandidhoo', 'Bandidhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 305, null, 'm3', null),
  ('Dh', 'Bandidhoo', 'Bandidhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 305, null, 'm3', null),
  ('Dh', 'Bandidhoo', 'Bandidhoo Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Bandidhoo', 'Bandidhoo Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Hulhudheli', 'Hulhudheli Water Plant', 'ro_unit', 'RO-01', 'RO plant', 50, null, 'm3/day', null),
  ('Dh', 'Hulhudheli', 'Hulhudheli Water Plant', 'ro_unit', 'RO-02', 'RO plant', 50, null, 'm3/day', null),
  ('Dh', 'Hulhudheli', 'Hulhudheli Water Plant', 'tank', 'ST-01', 'Storage tank', 330, null, 'm3', null),
  ('Dh', 'Hulhudheli', 'Hulhudheli Water Plant', 'tank', 'ST-02', 'Storage tank', 330, null, 'm3', null),
  ('Dh', 'Hulhudheli', 'Hulhudheli Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Hulhudheli', 'Hulhudheli Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Hulhudheli', 'Hulhudheli Sewerage System', 'pump', 'PS-03', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Hulhudheli', 'Hulhudheli Sewerage System', 'pump', 'PS-04', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 100, null, 'm3/day', null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 125, null, 'm3', null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 125, null, 'm3', null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Sewerage System', 'pump', 'PS-03', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Sewerage System', 'pump', 'PS-04', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Sewerage System', 'pump', 'PS-05', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Sewerage System', 'pump', 'PS-06', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Sewerage System', 'pump', 'PS-07', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Kudahuvadhoo', 'Kudahuvadhoo Sewerage System', 'pump', 'PS-08', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Maaenboodhoo', 'Maaenboodhoo Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Maaenboodhoo', 'Maaenboodhoo Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('Dh', 'Meedhoo', 'Meedhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 30, 23, 'm3/day', null),
  ('Dh', 'Meedhoo', 'Meedhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 30, 23, 'm3/day', null),
  ('Dh', 'Meedhoo', 'Meedhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 270, null, 'm3', null),
  ('Dh', 'Meedhoo', 'Meedhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 270, null, 'm3', null),
  ('Dh', 'Meedhoo', 'Meedhoo Sewerage System', 'other', 'VS-01', 'Vacuum station (55 Interface Units)', null, null, null, null),
  ('Dh', 'Meedhoo', 'Meedhoo Sewerage System', 'other', 'STP-01', 'Sewage treatment plant (Aeration System)', null, null, null, 'Components Damaged'),
  ('Dh', 'Rinbidhoo', 'Rinbidhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 30, null, 'm3/day', null),
  ('Dh', 'Rinbidhoo', 'Rinbidhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 30, null, 'm3/day', null),
  ('Dh', 'Rinbidhoo', 'Rinbidhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 120, null, 'm3', null),
  ('Dh', 'Rinbidhoo', 'Rinbidhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 120, null, 'm3', null),
  ('Dh', 'Rinbidhoo', 'Rinbidhoo Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('Dh', 'Rinbidhoo', 'Rinbidhoo Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('F', 'Bilehdhoo', 'Bilehdhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 40, null, 'm3/day', null),
  ('F', 'Bilehdhoo', 'Bilehdhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 40, null, 'm3/day', null),
  ('F', 'Bilehdhoo', 'Bilehdhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 330, null, 'm3', null),
  ('F', 'Bilehdhoo', 'Bilehdhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 330, null, 'm3', null),
  ('F', 'Bilehdhoo', 'Bilehdhoo Water Plant', 'tank', 'CT-01', 'Collection tank', 400, null, 'm3', null),
  ('F', 'Bilehdhoo', 'Bilehdhoo Water Plant', 'other', 'RW-01', 'Rainwater plant', 50, null, 'm3/day', null),
  ('F', 'Bilehdhoo', 'Bilehdhoo Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('F', 'Bilehdhoo', 'Bilehdhoo Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('F', 'Dhranboodhoo', 'Dhranboodhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 35, null, 'm3/day', null),
  ('F', 'Dhranboodhoo', 'Dhranboodhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 35, null, 'm3/day', null),
  ('F', 'Dhranboodhoo', 'Dhranboodhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 305, null, 'm3', null),
  ('F', 'Dhranboodhoo', 'Dhranboodhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 305, null, 'm3', null),
  ('F', 'Dhranboodhoo', 'Dhranboodhoo Water Plant', 'tank', 'CT-01', 'Collection tank', 330, null, 'm3', null),
  ('F', 'Dhranboodhoo', 'Dhranboodhoo Water Plant', 'other', 'RW-01', 'Rainwater plant', 60, null, 'm3/day', null),
  ('F', 'Dhranboodhoo', 'Dhranboodhoo Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('F', 'Dhranboodhoo', 'Dhranboodhoo Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('F', 'Feeali', 'Feeali Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('F', 'Magoodhoo', 'Magoodhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 35, 27, 'm3/day', null),
  ('F', 'Magoodhoo', 'Magoodhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 35, 27, 'm3/day', null),
  ('F', 'Magoodhoo', 'Magoodhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 200, null, 'm3', null),
  ('F', 'Magoodhoo', 'Magoodhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 200, null, 'm3', null),
  ('F', 'Magoodhoo', 'Magoodhoo Water Plant', 'other', 'RW-01', 'Rainwater plant', 50, null, 'm3/day', null),
  ('F', 'Magoodhoo', 'Magoodhoo Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('F', 'Magoodhoo', 'Magoodhoo Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('F', 'Nilandhoo', 'Nilandhoo Sewerage System', 'other', 'VS-01', 'Vacuum station (95 Interface Units)', null, null, null, null),
  ('F', 'Nilandhoo', 'Nilandhoo Sewerage System', 'other', 'STP-01', 'Sewage treatment plant (Rotating Bio Disc)', null, null, null, 'Not operational due to high electricity usage'),
  ('K', 'Kudagiri', 'Kudagiri Water Plant', 'ro_unit', 'RO-01', 'RO plant', 80, 72, 'm3/day', null),
  ('K', 'Kudagiri', 'Kudagiri Water Plant', 'tank', 'ST-01', 'Storage tank', 230, null, 'm3', null),
  ('K', 'Kudagiri', 'Kudagiri Water Plant', 'tank', 'ST-02', 'Storage tank', 230, null, 'm3', null),
  ('M', 'Dhiggaru', 'Dhiggaru Water Plant', 'ro_unit', 'RO-01', 'RO plant', 20, null, 'm3/day', null),
  ('M', 'Dhiggaru', 'Dhiggaru Water Plant', 'ro_unit', 'RO-02', 'RO plant', 20, null, 'm3/day', null),
  ('M', 'Dhiggaru', 'Dhiggaru Water Plant', 'ro_unit', 'RO-03', 'RO plant', 50, null, 'm3/day', null),
  ('M', 'Dhiggaru', 'Dhiggaru Water Plant', 'tank', 'ST-01', 'Storage tank', 200, null, 'm3', null),
  ('M', 'Dhiggaru', 'Dhiggaru Water Plant', 'other', 'RW-01', 'Rainwater plant', 120, null, 'm3/day', null),
  ('M', 'Dhiggaru', 'Dhiggaru Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('M', 'Dhiggaru', 'Dhiggaru Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('M', 'Kolhufushi', 'Kolhufushi Water Plant', 'ro_unit', 'RO-01', 'RO plant', 45, null, 'm3/day', null),
  ('M', 'Kolhufushi', 'Kolhufushi Water Plant', 'ro_unit', 'RO-02', 'RO plant', 45, null, 'm3/day', null),
  ('M', 'Kolhufushi', 'Kolhufushi Water Plant', 'tank', 'ST-01', 'Storage tank', 385, null, 'm3', null),
  ('M', 'Kolhufushi', 'Kolhufushi Water Plant', 'tank', 'ST-02', 'Storage tank', 385, null, 'm3', null),
  ('M', 'Kolhufushi', 'Kolhufushi Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('M', 'Kolhufushi', 'Kolhufushi Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('M', 'Kolhufushi', 'Kolhufushi Sewerage System', 'pump', 'PS-03', 'Grundfos pump station', null, null, null, null),
  ('M', 'Maduvvari', 'Maduvvari Water Plant', 'ro_unit', 'RO-01', 'RO plant', 40, null, 'm3/day', null),
  ('M', 'Maduvvari', 'Maduvvari Water Plant', 'ro_unit', 'RO-02', 'RO plant', 40, null, 'm3/day', null),
  ('M', 'Maduvvari', 'Maduvvari Water Plant', 'tank', 'ST-01', 'Storage tank', 330, null, 'm3', null),
  ('M', 'Maduvvari', 'Maduvvari Water Plant', 'tank', 'ST-02', 'Storage tank', 330, null, 'm3', null),
  ('M', 'Maduvvari', 'Maduvvari Water Plant', 'tank', 'CT-01', 'Collection tank', 430, null, 'm3', null),
  ('M', 'Maduvvari', 'Maduvvari Water Plant', 'other', 'RW-01', 'Rainwater plant', 50, null, 'm3/day', null),
  ('M', 'Maduvvari', 'Maduvvari Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('M', 'Maduvvari', 'Maduvvari Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('M', 'Mulah', 'Mulah Water Plant', 'ro_unit', 'RO-01', 'RO plant', 20, 25, 'm3/day', null),
  ('M', 'Mulah', 'Mulah Water Plant', 'ro_unit', 'RO-02', 'RO plant', 20, 0, 'm3/day', null),
  ('M', 'Mulah', 'Mulah Water Plant', 'ro_unit', 'RO-03', 'RO plant', 50, null, 'm3/day', null),
  ('M', 'Mulah', 'Mulah Water Plant', 'tank', 'ST-01', 'Storage tank', 300, null, 'm3', null),
  ('M', 'Mulah', 'Mulah Water Plant', 'other', 'RW-01', 'Rainwater plant', 120, null, 'm3/day', null),
  ('M', 'Mulah', 'Mulah Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('M', 'Mulah', 'Mulah Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('M', 'Mulah', 'Mulah Sewerage System', 'pump', 'PS-03', 'Flygt pump station', null, null, null, null),
  ('M', 'Mulah', 'Mulah Sewerage System', 'pump', 'PS-04', 'Flygt pump station', null, null, null, null),
  ('M', 'Muli', 'Muli Water Plant', 'ro_unit', 'RO-01', 'RO plant', 80, 14, 'm3/day', null),
  ('M', 'Muli', 'Muli Water Plant', 'ro_unit', 'RO-02', 'RO plant', 80, 0, 'm3/day', null),
  ('M', 'Muli', 'Muli Water Plant', 'tank', 'ST-01', 'Storage tank', 570, null, 'm3', null),
  ('M', 'Muli', 'Muli Water Plant', 'tank', 'ST-02', 'Storage tank', 570, null, 'm3', null),
  ('M', 'Muli', 'Muli Water Plant', 'other', 'RW-01', 'Rainwater plant', 50, null, 'm3/day', null),
  ('M', 'Muli', 'Muli Sewerage System', 'pump', 'PS-01', 'Pump station', null, null, null, null),
  ('M', 'Muli', 'Muli Sewerage System', 'pump', 'PS-02', 'Pump station', null, null, null, null),
  ('M', 'Muli', 'Muli Sewerage System', 'pump', 'PS-03', 'Pump station', null, null, null, null),
  ('M', 'Muli', 'Muli Sewerage System', 'pump', 'PS-04', 'Pump station', null, null, null, null),
  ('M', 'Muli', 'Muli Sewerage System', 'pump', 'PS-05', 'Pump station', null, null, null, null),
  ('M', 'Muli', 'Muli Sewerage System', 'pump', 'PS-06', 'Pump station', null, null, null, null),
  ('M', 'Muli', 'Muli Sewerage System', 'pump', 'PS-07', 'Pump station', null, null, null, null),
  ('M', 'Muli', 'Muli Sewerage System', 'other', 'STP-01', 'Sewage treatment plant (Aeration System)', null, null, null, 'Not Using / Operational'),
  ('Th', 'Buruni', 'Buruni Water Plant', 'ro_unit', 'SARO-01', 'Standalone RO plant', 30, null, 'm3/day', null),
  ('Th', 'Buruni', 'Buruni Water Plant', 'tank', 'ST-01', 'Storage tank', 10, null, 'm3', 'Standalone Plant Storage'),
  ('Th', 'Buruni', 'Buruni Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Buruni', 'Buruni Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Dhiyamigili', 'Dhiyamigili Water Plant', 'ro_unit', 'SARO-01', 'Standalone RO plant', 10, null, 'm3/day', null),
  ('Th', 'Dhiyamigili', 'Dhiyamigili Water Plant', 'tank', 'ST-01', 'Storage tank', 50, null, 'm3', 'Standalone Plant Storage'),
  ('Th', 'Dhiyamigili', 'Dhiyamigili Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('Th', 'Dhiyamigili', 'Dhiyamigili Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('Th', 'Gaadhifushi', 'Gaadhifushi Water Plant', 'ro_unit', 'RO-01', 'RO plant', 30, null, 'm3/day', null),
  ('Th', 'Gaadhifushi', 'Gaadhifushi Water Plant', 'ro_unit', 'RO-02', 'RO plant', 30, null, 'm3/day', null),
  ('Th', 'Gaadhifushi', 'Gaadhifushi Water Plant', 'tank', 'ST-01', 'Storage tank', 150, null, 'm3', null),
  ('Th', 'Gaadhifushi', 'Gaadhifushi Water Plant', 'tank', 'ST-02', 'Storage tank', 150, null, 'm3', null),
  ('Th', 'Gaadhifushi', 'Gaadhifushi Water Plant', 'tank', 'CT-01', 'Collection tank', 370, null, 'm3', null),
  ('Th', 'Gaadhifushi', 'Gaadhifushi Water Plant', 'other', 'RW-01', 'Rainwater plant', 150, null, 'm3/day', null),
  ('Th', 'Gaadhifushi', 'Gaadhifushi Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('Th', 'Gaadhifushi', 'Gaadhifushi Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('Th', 'Guraidhoo', 'Guraidhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 72, null, 'm3/day', null),
  ('Th', 'Guraidhoo', 'Guraidhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 144, null, 'm3', null),
  ('Th', 'Guraidhoo', 'Guraidhoo Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Guraidhoo', 'Guraidhoo Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Guraidhoo', 'Guraidhoo Sewerage System', 'pump', 'PS-03', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Hirilandhoo', 'Hirilandhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 70, null, 'm3/day', null),
  ('Th', 'Hirilandhoo', 'Hirilandhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 70, null, 'm3/day', null),
  ('Th', 'Hirilandhoo', 'Hirilandhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 500, null, 'm3', null),
  ('Th', 'Hirilandhoo', 'Hirilandhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 500, null, 'm3', null),
  ('Th', 'Hirilandhoo', 'Hirilandhoo Sewerage System', 'pump', 'PS-01', 'Pump station', null, null, null, null),
  ('Th', 'Hirilandhoo', 'Hirilandhoo Sewerage System', 'pump', 'PS-02', 'Pump station', null, null, null, null),
  ('Th', 'Kandoodhoo', 'Kandoodhoo Water Plant', 'tank', 'CT-01', 'Collection tank', 50, null, 'm3', null),
  ('Th', 'Kandoodhoo', 'Kandoodhoo Water Plant', 'tank', 'CT-02', 'Collection tank', 100, null, 'm3', null),
  ('Th', 'Kandoodhoo', 'Kandoodhoo Water Plant', 'other', 'RW-01', 'Rainwater plant', 40, null, 'm3/day', null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 60, null, 'm3/day', null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 60, null, 'm3/day', null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 325, null, 'm3', null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 325, null, 'm3', null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Water Plant', 'tank', 'CT-01', 'Collection tank', 50, null, 'm3', null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Water Plant', 'tank', 'CT-02', 'Collection tank', 100, null, 'm3', null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Water Plant', 'other', 'RW-01', 'Rainwater plant', 40, null, 'm3/day', null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Sewerage System', 'pump', 'PS-01', 'Evergush pump station', null, null, null, null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Sewerage System', 'pump', 'PS-02', 'Evergush pump station', null, null, null, null),
  ('Th', 'Kinbidhoo', 'Kinbidhoo Sewerage System', 'pump', 'PS-03', 'Evergush pump station', null, null, null, null),
  ('Th', 'Madifushi', 'Madifushi Water Plant', 'ro_unit', 'SARO-01', 'Standalone RO plant', 10, null, 'm3/day', null),
  ('Th', 'Madifushi', 'Madifushi Water Plant', 'tank', 'ST-01', 'Storage tank', 20, null, 'm3', 'Standalone Plant Storage'),
  ('Th', 'Madifushi', 'Madifushi Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Madifushi', 'Madifushi Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Omadhoo', 'Omadhoo Water Plant', 'tank', 'CT-01', 'Collection tank', 50, null, 'm3', null),
  ('Th', 'Omadhoo', 'Omadhoo Water Plant', 'tank', 'CT-02', 'Collection tank', 100, null, 'm3', null),
  ('Th', 'Omadhoo', 'Omadhoo Water Plant', 'other', 'RW-01', 'Rainwater plant', 40, null, 'm3/day', null),
  ('Th', 'Thimarafushi', 'Thimarafushi Water Plant', 'ro_unit', 'RO-01', 'RO plant', 60, null, 'm3/day', null),
  ('Th', 'Thimarafushi', 'Thimarafushi Water Plant', 'ro_unit', 'RO-02', 'RO plant', 60, null, 'm3/day', null),
  ('Th', 'Thimarafushi', 'Thimarafushi Water Plant', 'tank', 'ST-01', 'Storage tank', 900, null, 'm3', null),
  ('Th', 'Thimarafushi', 'Thimarafushi Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Thimarafushi', 'Thimarafushi Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Thimarafushi', 'Thimarafushi Sewerage System', 'pump', 'PS-03', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Thimarafushi', 'Thimarafushi Sewerage System', 'other', 'STP-01', 'Sewage treatment plant (Aeration System)', null, null, null, 'Spares not available'),
  ('Th', 'Vandhoo', 'Vandhoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 21, null, 'm3/day', null),
  ('Th', 'Vandhoo', 'Vandhoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 21, null, 'm3/day', null),
  ('Th', 'Vandhoo', 'Vandhoo Water Plant', 'tank', 'ST-01', 'Storage tank', 130, null, 'm3', null),
  ('Th', 'Vandhoo', 'Vandhoo Water Plant', 'tank', 'ST-02', 'Storage tank', 130, null, 'm3', null),
  ('Th', 'Vandhoo', 'Vandhoo Water Plant', 'other', 'RW-01', 'Rainwater plant', 50, null, 'm3/day', null),
  ('Th', 'Vandhoo', 'Vandhoo Sewerage System', 'pump', 'PS-01', 'Pump station', null, null, null, null),
  ('Th', 'Vandhoo', 'Vandhoo Sewerage System', 'pump', 'PS-02', 'Pump station', null, null, null, null),
  ('Th', 'Veymandoo', 'Veymandoo Water Plant', 'ro_unit', 'RO-01', 'RO plant', 75, null, 'm3/day', null),
  ('Th', 'Veymandoo', 'Veymandoo Water Plant', 'ro_unit', 'RO-02', 'RO plant', 75, null, 'm3/day', null),
  ('Th', 'Veymandoo', 'Veymandoo Water Plant', 'tank', 'ST-01', 'Storage tank', 300, null, 'm3', null),
  ('Th', 'Veymandoo', 'Veymandoo Water Plant', 'tank', 'ST-02', 'Storage tank', 300, null, 'm3', null),
  ('Th', 'Veymandoo', 'Veymandoo Water Plant', 'other', 'RW-01', 'Rainwater plant', 40, null, 'm3/day', null),
  ('Th', 'Veymandoo', 'Veymandoo Sewerage System', 'pump', 'PS-01', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Veymandoo', 'Veymandoo Sewerage System', 'pump', 'PS-02', 'Grundfos pump station', null, null, null, null),
  ('Th', 'Vilufushi', 'Vilufushi Water Plant', 'ro_unit', 'RO-01', 'RO plant', 60, null, 'm3/day', null),
  ('Th', 'Vilufushi', 'Vilufushi Water Plant', 'ro_unit', 'RO-02', 'RO plant', 60, null, 'm3/day', null),
  ('Th', 'Vilufushi', 'Vilufushi Water Plant', 'tank', 'ST-01', 'Storage tank', 770, null, 'm3', null),
  ('Th', 'Vilufushi', 'Vilufushi Water Plant', 'tank', 'ST-02', 'Storage tank', 770, null, 'm3', null),
  ('Th', 'Vilufushi', 'Vilufushi Sewerage System', 'pump', 'PS-01', 'Flygt pump station', null, null, null, null),
  ('Th', 'Vilufushi', 'Vilufushi Sewerage System', 'pump', 'PS-02', 'Flygt pump station', null, null, null, null),
  ('Th', 'Vilufushi', 'Vilufushi Sewerage System', 'pump', 'PS-03', 'Flygt pump station', null, null, null, null),
  ('Th', 'Vilufushi', 'Vilufushi Sewerage System', 'pump', 'PS-04', 'Flygt pump station', null, null, null, null),
  ('Th', 'Vilufushi', 'Vilufushi Sewerage System', 'other', 'STP-01', 'Sewage treatment plant (Rotating Bio Disc)', null, null, null, 'Spares not available');

insert into assets (facility_id, kind, tag, make_model, rated_capacity, operating_capacity, capacity_unit, notes)
select f.id, w.kind, w.tag, w.make_model, w.rated, w.operating, w.unit, w.notes
  from wsd_assets w join atolls a on a.code = w.atoll join islands i on i.atoll_id = a.id and i.name = w.island
  join facilities f on f.island_id = i.id and f.name = w.facility
on conflict (facility_id, kind, tag) do nothing;

-- Powerhouses: fuel storage from the island sheets where not set; survey notes added.
create temporary table island_sheet_powerhouses (atoll text, island text, fuel_l numeric, notes text) on commit drop;
insert into island_sheet_powerhouses values
  ('Dh', 'Bandidhoo', 15000, 'Current demand 257 kW
Actual generation capacity 830 kW'),
  ('Dh', 'Hulhudheli', 25391, 'Current demand 388 kW
Actual generation capacity 980 kW
Fuel tanks: Steel cylinderic 4060*2000mm'),
  ('Dh', 'Kudahuvadhoo', 144778, 'Current demand 1813 kW
Actual generation capacity 3510 kW
Fuel tanks: Steel cylinderic 4919*6186mm'),
  ('Dh', 'Maaenboodhoo', 10000, 'Current demand 298 kW
Actual generation capacity 850 kW'),
  ('Dh', 'Meedhoo', 97388, 'Current demand 487 kW
Actual generation capacity 1600 kW'),
  ('Dh', 'Rinbidhoo', 10000, 'Current demand 215 kW
Actual generation capacity 495 kW'),
  ('F', 'Bilehdhoo', 61570, 'Current demand 431 kW
Actual generation capacity 1040 kW
Fuel tanks: 1 steel cylinderic 4797*3992mm; 2 Steel cubic; 1 Steel cubic'),
  ('F', 'Dhranboodhoo', 17713, 'Current demand 216 kW
Actual generation capacity 514 kW
Fuel tanks: Steel cylinderic 2528*3017mm'),
  ('F', 'Feeali', 60108, 'Current demand 485 kW
Actual generation capacity 1100 kW
Fuel tanks: steel cylinderic 4930*3979mm'),
  ('F', 'Magoodhoo', 76616, 'Current demand 355 kW
Actual generation capacity 1220 kW
Fuel tanks: Steel cylinderic 6308*3971mm'),
  ('F', 'Nilandhoo', 16500, 'Current demand 1185 kW
Actual generation capacity 2320 kW
Fuel tanks: 3 Steel cubic 4''*8''; 1 Steel cylinderic; 1 Steel cylinderic'),
  ('Th', 'Dhiyamigili', 17400, 'Actual generation capacity 690 kW'),
  ('Th', 'Gaadhifushi', 31968, 'Actual generation capacity 595 kW
Fuel tanks: 1 Steel cubic 3''7*2''6*2''6; 1 Steel cylinderic'),
  ('Th', 'Guraidhoo', 59622, 'Actual generation capacity 1410 kW'),
  ('Th', 'Hirilandhoo', 77679, 'Actual generation capacity 1590 kW'),
  ('Th', 'Kandoodhoo', 5000, 'Actual generation capacity 450 kW'),
  ('Th', 'Kinbidhoo', 22781, 'Actual generation capacity 740 kW
Fuel tanks: 3 Steel cubic; 2  Steel cubic 940*940*1320mm'),
  ('Th', 'Madifushi', 10000, 'Actual generation capacity 975 kW
Fuel tanks: Steel cubic 1199*1187mm'),
  ('Th', 'Omadhoo', 24553, 'Actual generation capacity 410 kW
Fuel tanks: Steel cylinderic 13''*6''5"'),
  ('Th', 'Thimarafushi', 48494, 'Actual generation capacity 1770 kW
Fuel tanks: Steel cylinderic 2089*14427mm'),
  ('Th', 'Vandhoo', 8100, 'Actual generation capacity 590 kW
Fuel tanks: Steel cubic'),
  ('Th', 'Veymandoo', 24000, 'Actual generation capacity 1380 kW
Fuel tanks: 1 Steel cubic 73"*48"*32"'),
  ('Th', 'Vilufushi', 25983, 'Actual generation capacity 1250 kW');

update facilities f
   set fuel_capacity_l = coalesce(f.fuel_capacity_l, s.fuel_l),
       notes = case when s.notes is null then f.notes
                    else coalesce(f.notes || E'\n', '') || 'Island information sheet (Oct 2026):' || E'\n' || s.notes end
  from island_sheet_powerhouses s, atolls a, islands i
 where a.code = s.atoll and i.atoll_id = a.id and i.name = s.island
   and f.island_id = i.id and f.service = 'electricity' and f.kind = 'powerhouse';
