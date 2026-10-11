-- Water & sewerage work and PSIP projects (Oct 2026).
--
-- From "Works Sewerage and water.xlsx":
--   * the region's Water & Sewerage fault log: each fault (Z-B/F-0001...) is
--     a work item on the island's water plant or sewerage system, and on the
--     RO unit / tank / pump station it names. Complete -> completed (on the
--     latest date logged); pending -> awaiting parts once a purchase
--     requisition is raised, else in progress. The actions taken become its
--     updates. The fault number is kept in external_ref, so a fault is only
--     ever imported once;
--   * PSIP ongoing projects (police posts, futsal ground, health centre),
--     visible to everyone, their status notes as the first update.

alter table work_orders add column external_ref text;
create unique index work_orders_external_ref_idx on work_orders (external_ref) where external_ref is not null;

create temporary table wsd_work (ref text, atoll text, island text, service service_type, facility text, asset_tag text, kind text,
  title text, description text, status text, started_on date, completed_on date) on commit drop;
insert into wsd_work values
  ('Z-B/F-0001', 'Dh', 'Maaenboodhoo', 'sewerage', 'Maaenboodhoo Sewerage System', 'PS-02', 'repair', 'Floats not working properly- Float switch required', 'WSD fault Z-B/F-0001 · priority 3 - Critical
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-21', '2026-09-10'),
  ('Z-B/F-0002', 'Dh', 'Maaenboodhoo', 'sewerage', 'Maaenboodhoo Sewerage System', null, 'other', 'Shortage of sewer house conenction materials', 'WSD fault Z-B/F-0002 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-21', null),
  ('Z-B/F-0003', 'Dh', 'Bandidhoo', 'water', 'Bandidhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0003 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-21', null),
  ('Z-B/F-0004', 'Dh', 'Bandidhoo', 'water', 'Bandidhoo Water Plant', null, 'other', 'Antiscalant and chlorine are in short supply and need to be restocked soon', 'WSD fault Z-B/F-0004 · priority 2 - High
Remarks: Inventory Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-21', '2026-07-21'),
  ('Z-B/F-0005', 'Dh', 'Rinbidhoo', 'water', 'Rinbidhoo Water Plant', 'ST-01', 'repair', 'The end of the RO plant storage tank pipe has become rusted, resulting in water leakage.', 'WSD fault Z-B/F-0005 · priority 3 - Critical
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-22', '2026-08-20'),
  ('Z-B/F-0006', 'Dh', 'Rinbidhoo', 'water', 'Rinbidhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0006 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0007', 'Dh', 'Rinbidhoo', 'sewerage', 'Rinbidhoo Sewerage System', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0007 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0008', 'Dh', 'Rinbidhoo', 'sewerage', 'Rinbidhoo Sewerage System', 'PS-01', 'repair', 'The Pump Station PLC meter is malfunctioning, resulting in all pumps being operated manually. This issue has remained unresolved for the past year', 'WSD fault Z-B/F-0008 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0009', 'Dh', 'Rinbidhoo', 'sewerage', 'Rinbidhoo Sewerage System', null, 'other', 'There is no submersible pump available for water and sewer service emergencies', 'WSD fault Z-B/F-0009 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0010', 'Dh', 'Meedhoo', 'sewerage', 'Meedhoo Sewerage System', 'VS-01', 'repair', 'Sewer interface units exhibit low vacuum flow. Twenty units were repaired prior to Ramadan this year, requested spare parts are pending to complete rectification on the remaining 30 units', 'WSD fault Z-B/F-0010 · priority 2 - High
Purchase requisitions: PR-26-001487
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-22', null),
  ('Z-B/F-0011', 'Dh', 'Meedhoo', 'sewerage', 'Meedhoo Sewerage System', 'STP-01', 'repair', 'The sewerage pump station wall is gradually deteriorating, causing debris to fall onto the pumps below', 'WSD fault Z-B/F-0011 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0012', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', 'RO-01', 'repair', 'The RO plant has minor leaks.', 'WSD fault Z-B/F-0012 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0013', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', 'RO-02', 'repair', 'The RO plant module has malfunctioned, resulting in the failure of fault alarm detection.', 'WSD fault Z-B/F-0013 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0014', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0014 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0015', 'Dh', 'Meedhoo', 'sewerage', 'Meedhoo Sewerage System', null, 'other', 'Shortage of sewer house conenction materials', 'WSD fault Z-B/F-0015 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-07-22', null),
  ('Z-B/F-0017', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', 'RO-01', 'repair', 'RO-CAT PUMP SPARES', 'WSD fault Z-B/F-0017 · priority 3 - Critical
Purchase requisitions: PR-26-005426
Remarks: PO/2026/05145 ∙ Alliance Engineering Solutions Pvt Ltd ( PO: Completely Received )
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-23', '2026-07-23'),
  ('Z-B/F-0021', 'Th', 'Gaadhifushi', 'water', 'Gaadhifushi Water Plant', 'RO-01', 'repair', 'SS NEEDLE VALVE 6000PSI/400BAR 1½” FEMALE THREAD', 'WSD fault Z-B/F-0021 · priority 3 - Critical
Purchase requisitions: PR-26-005475
Remarks: PO/2026/04799 ∙ Mnaam Private Limited ( PO: Completely Received )
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-23', '2026-07-23'),
  ('Z-B/F-0022', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', null, 'other', 'WATER METER ( COMPLETE) 15PCS', 'WSD fault Z-B/F-0022 · priority 3 - Critical
Purchase requisitions: PR-26-003250
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0024', 'Th', 'Kinbidhoo', 'water', 'Kinbidhoo Water Plant', null, 'other', 'PVC GUTTER (70 feet X 2) total 140 feet ( dhiyadhovi)', 'WSD fault Z-B/F-0024 · priority 1 - Normal
Purchase requisitions: PR-26-003766
Remarks: PR - CANCELED; This PR has been cancelled. The branch was notified that the task is CAD-related
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-23', '2026-07-23'),
  ('Z-B/F-0027', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', 'RO-01', 'repair', 'CARTRIDGE FILTER 20" X 4.5" (5 MICRONS)', 'WSD fault Z-B/F-0027 · priority 3 - Critical
Purchase requisitions: PR-26-004071
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0028', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', null, 'other', 'WATER METER DN40MM (COMPLETE) FOR WATER CONNECTIONS', 'WSD fault Z-B/F-0028 · priority 2 - High
Purchase requisitions: PR-26-003250
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0031', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', 'RO-01', 'repair', 'CAT PUMP SERVICE SPARES', 'WSD fault Z-B/F-0031 · priority 3 - Critical
Purchase requisitions: PR-26-004084
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0032', 'Th', 'Vilufushi', 'sewerage', 'Vilufushi Sewerage System', 'PS-01', 'repair', 'SCHNEIDER RSB 2A080P7 8PIN RELAY', 'WSD fault Z-B/F-0032 · priority 1 - Normal
Purchase requisitions: PR-26-004097
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0033', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', 'RO-01', 'repair', 'CARTRIDGE FILTER LENGTH 30" X DIA 2.5", 5 MICRONS', 'WSD fault Z-B/F-0033 · priority 3 - Critical
Purchase requisitions: PR-26-004093
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0034', 'Dh', 'Kudahuvadhoo', 'water', 'Kudahuvadhoo Water Plant', 'RO-01', 'repair', 'PRESSURE SWITCH FOR RO PLANT ( HIGH PRESSURE SWITCH 20 TO 100 BAR 1/2" 220V & LOW PRESSURE SWITCH 0-6 BAR THREAD SIZE 1/2"', 'WSD fault Z-B/F-0034 · priority 3 - Critical
Purchase requisitions: PR-26-003780
Remarks: PO/2026/03653 ∙ The Mechanism Maldives Private Limited
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0035', 'Dh', 'Kudahuvadhoo', 'sewerage', 'Kudahuvadhoo Sewerage System', null, 'other', 'Connection materials for tar roads (UPVC SEWER PIPE DN 110)', 'WSD fault Z-B/F-0035 · priority 3 - Critical
Purchase requisitions: PR-26-005431
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0038', 'Th', 'Hirilandhoo', 'water', 'Hirilandhoo Water Plant', null, 'other', 'WATER CONNECTION MATERIALS ( EF TAPPING TEE 110/25MM, 39.5V, EF TAPPING TEE 90/25MM, 39.5V, PE PIPE 25MM, PE 100, PN10, SDR 17, 100M ROLL, EF COUPLER 25 MM 39.5V )', 'WSD fault Z-B/F-0038 · priority 3 - Critical
Purchase requisitions: PR-26-005218
Remarks: RFQ: To be sent to Vendor
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0039', 'Dh', 'Kudahuvadhoo', 'water', 'Kudahuvadhoo Water Plant', 'RO-01', 'repair', 'CARTRIDGE FILTER 20" X 4.5" (5 MICRONS)', 'WSD fault Z-B/F-0039 · priority 3 - Critical
Purchase requisitions: PR-26-005778
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0040', 'Dh', 'Kudahuvadhoo', 'water', 'Kudahuvadhoo Water Plant', 'RO-01', 'repair', 'REPAIR OF GRUNDFOS PUMP SP-148N AND ENGINE MS4000R AND OIL CHANGE.', 'WSD fault Z-B/F-0040 · priority 3 - Critical
Purchase requisitions: PR-26-004280
Remarks: PO: Pending Prepayment
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0041', 'Th', 'Kinbidhoo', 'water', 'Kinbidhoo Water Plant', 'RO-01', 'repair', 'PRESSURE SENSOR, 1/2" MALE THREAD, 0-6 BAR FOR RO PLANT', 'WSD fault Z-B/F-0041 · priority 3 - Critical
Purchase requisitions: PR-26-005789
Remarks: PO: Pending Prepayment
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-07-23', null),
  ('Z-B/F-0043', 'Dh', 'Kudahuvadhoo', 'water', 'Kudahuvadhoo Water Plant', null, 'other', 'Materials Required for Water Connections ( Branch Memo no: M08-F/IM/2026/151 ) PE PIPE 25MM, 100M ROLL', 'WSD fault Z-B/F-0043 · priority 3 - Critical
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-25', '2026-07-25'),
  ('Z-B/F-0044', 'Dh', 'Kudahuvadhoo', 'sewerage', 'Kudahuvadhoo Sewerage System', null, 'other', 'RDC has already begun paving the island roads. Therefore, required to install the water and sewer connections in that area before the asphalt is laid ( Branch memo number: M08-F/IM/2026/166 )', 'WSD fault Z-B/F-0044 · priority 3 - Critical
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-26', '2026-07-26'),
  ('Z-B/F-0047', 'F', 'Magoodhoo', 'water', 'Magoodhoo Water Plant', null, 'other', 'SERVICING OF DAVEY PUMP (BRINE DISCHARGE)DAVEY, 62103, O-RING, MECHANICAL SEAL AND IMPELLER, (FENKA WORK SHOP REFERENCE NO. FW-JC-25-0266)', 'WSD fault Z-B/F-0047 · priority 3 - Critical
Purchase requisitions: PR-26-004020
Remarks: PO/2026/04802 ∙ Static Company Pvt Ltd (PO: Completely Received )
Completed on RO-02; the completion date was not recorded.
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', null, null),
  ('Z-B/F-0049', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', 'ST-01', 'repair', 'The production water tank''s outlet pipe is severly rusted and requires immediate rectification.', 'WSD fault Z-B/F-0049 · priority 3 - Critical
Remarks: Inventory Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-25', '2026-07-30'),
  ('Z-B/F-0051', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', 'RO-01', 'repair', 'Th. Guraidhoo RO plant is currently out of operation and must be restored to operational status as soon as possible.', 'WSD fault Z-B/F-0051 · priority 3 - Critical
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-07-25', '2026-07-25'),
  ('Z-B/F-0053', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', null, 'other', 'EF end cap (in two sizes) are required for the ongoing water network extension work', 'WSD fault Z-B/F-0053 · priority 1 - Normal
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-09', '2026-08-09'),
  ('Z-B/F-0054', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', null, 'other', 'A supply of water connection materials is required for the 100-housing-unit project', 'WSD fault Z-B/F-0054 · priority 1 - Normal
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-09', '2026-08-09'),
  ('Z-B/F-0056', 'Th', 'Omadhoo', 'water', 'Omadhoo Water Plant', null, 'other', 'Shortage of chlorine', 'WSD fault Z-B/F-0056 · priority 2 - High
Remarks: Inventory Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-10', '2026-08-10'),
  ('Z-B/F-0059', 'Th', 'Gaadhifushi', 'water', 'Gaadhifushi Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0059 · priority 1 - Normal
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-12', '2026-08-12'),
  ('Z-B/F-0061', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', null, 'other', 'A stand fan is required for the RO plant motor cooling and staff purposes.', 'WSD fault Z-B/F-0061 · priority 1 - Normal
Remarks: Inventory Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-10', '2026-08-10'),
  ('Z-B/F-0062', 'Th', 'Thimarafushi', 'water', 'Thimarafushi Water Plant', null, 'other', 'Shortage of chlorine', 'WSD fault Z-B/F-0062 · priority 2 - High
Remarks: Inventory Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-11', '2026-08-11'),
  ('Z-B/F-0063', 'Th', 'Thimarafushi', 'water', 'Thimarafushi Water Plant', null, 'other', 'Shortage of filter cartridges', 'WSD fault Z-B/F-0063 · priority 2 - High
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-11', '2026-08-11'),
  ('Z-B/F-0064', 'Th', 'Thimarafushi', 'water', 'Thimarafushi Water Plant', null, 'other', 'Shortage of sewer house connection materials ( for MTCC Work Site new connection )', 'WSD fault Z-B/F-0064 · priority 2 - High
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-11', '2026-08-11'),
  ('Z-B/F-0066', 'F', 'Magoodhoo', 'water', 'Magoodhoo Water Plant', null, 'other', 'Shortage of chlorine and antiscalant', 'WSD fault Z-B/F-0066 · priority 2 - High
Remarks: Inventory Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-13', '2026-08-13'),
  ('Z-B/F-0067', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', null, 'other', 'A 90mm, PN16 EF coupler is required for the water connection', 'WSD fault Z-B/F-0067 · priority 1 - Normal
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-13', '2026-08-13'),
  ('Z-B/F-0068', 'Th', 'Hirilandhoo', 'water', 'Hirilandhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0068 · priority 2 - High
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-16', '2026-08-16'),
  ('Z-B/F-0070', 'Th', 'Hirilandhoo', 'water', 'Hirilandhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0070 · priority 2 - High
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-16', '2026-08-16'),
  ('Z-B/F-0071', 'Dh', 'Kudahuvadhoo', 'water', 'Kudahuvadhoo Water Plant', null, 'other', 'Materials needed for sewerage extension work', 'WSD fault Z-B/F-0071 · priority 2 - High
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-17', '2026-08-17'),
  ('Z-B/F-0072', 'Dh', 'Rinbidhoo', 'water', 'Rinbidhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0072 · priority 2 - High
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-17', '2026-08-17'),
  ('Z-B/F-0073', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0073 · priority 2 - High
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-17', '2026-08-17'),
  ('Z-B/F-0074', 'Dh', 'Kudahuvadhoo', 'water', 'Kudahuvadhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0074 · priority 1 - Normal
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-18', '2026-08-18'),
  ('Z-B/F-0077', 'Dh', 'Rinbidhoo', 'water', 'Rinbidhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0077 · priority 1 - Normal
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-19', '2026-08-19'),
  ('Z-B/F-0078', 'Dh', 'Kudahuvadhoo', 'water', 'Kudahuvadhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0078 · priority 1 - Normal
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-19', '2026-08-19'),
  ('Z-B/F-0079', 'Dh', 'Rinbidhoo', 'water', 'Rinbidhoo Water Plant', 'RO-01', 'repair', 'Fittings required for Ro plant Rectification work.', 'WSD fault Z-B/F-0079 · priority 2 - High
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-19', '2026-08-19'),
  ('Z-B/F-0080', 'Dh', 'Rinbidhoo', 'water', 'Rinbidhoo Water Plant', null, 'other', 'Shortage of water house connection materials', 'WSD fault Z-B/F-0080 · priority 1 - Normal
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-19', '2026-08-19'),
  ('Z-B/F-0088', 'Dh', 'Hulhudheli', 'sewerage', 'Hulhudheli Sewerage System', 'PS-01', 'repair', 'OMRON MY4N RELAY, 14 PIN, 220/240VAC ( PS Panel Item )', 'WSD fault Z-B/F-0088 · priority 2 - High
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-24', '2026-08-24'),
  ('Z-B/F-0090', 'Th', 'Thimarafushi', 'water', 'Thimarafushi Water Plant', 'RO-01', 'repair', 'ANALOGU PRESSURE GUAGE 100BAR for RO Plant rectification work', 'WSD fault Z-B/F-0090 · priority 3 - Critical
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-24', '2026-08-24'),
  ('Z-B/F-0091', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', 'RO-01', 'repair', 'VALVOLINE - HYDRAULIC OIL ULTRA MAX AW68 ( 18L) For CAT Pump oil change', 'WSD fault Z-B/F-0091 · priority 3 - Critical
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-24', '2026-08-24'),
  ('Z-B/F-0102', 'F', 'Magoodhoo', 'water', 'Magoodhoo Water Plant', 'RO-02', 'repair', 'SPARES OF DANFOSS APP6.5', 'WSD fault Z-B/F-0102 · priority 3 - Critical
Purchase requisitions: PR-26-006055
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0103', 'F', 'Nilandhoo', 'sewerage', 'Nilandhoo Sewerage System', null, 'other', 'BOWSER WHEEL', 'WSD fault Z-B/F-0103 · priority 3 - Critical
Purchase requisitions: PR-26-006431
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0104', 'F', 'Nilandhoo', 'sewerage', 'Nilandhoo Sewerage System', null, 'other', 'MECHANICAL SEAL NO: 5490522, FOR VACUUM PUMP', 'WSD fault Z-B/F-0104 · priority 3 - Critical
Purchase requisitions: PR-26-006632
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0105', 'F', 'Bilehdhoo', 'water', 'Bilehdhoo Water Plant', 'RO-02', 'repair', 'SS NEEDLE VALVE 6000PSI/400BAR ½” FEMALE THREAD', 'WSD fault Z-B/F-0105 · priority 3 - Critical
Purchase requisitions: PR-26-005086
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0106', 'Dh', 'Kudahuvadhoo', 'sewerage', 'Kudahuvadhoo Sewerage System', null, 'other', 'BOWSER PUMP- BATTIONI PAGANI MEC 6500 M LF SX D80 PUMP', 'WSD fault Z-B/F-0106 · priority 3 - Critical
Purchase requisitions: PR-26-006595
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0107', 'Dh', 'Rinbidhoo', 'sewerage', 'Rinbidhoo Sewerage System', 'PS-01', 'repair', 'ENM-10 WITH 20M CABLE (LEVEL REG FLOAT SWITCH)QTY:5', 'WSD fault Z-B/F-0107 · priority 3 - Critical
Purchase requisitions: PR-26-000448
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0108', 'Dh', 'Maaenboodhoo', 'sewerage', 'Maaenboodhoo Sewerage System', 'PS-02', 'repair', 'FLOAT SWITCH WITH 20M CABLE, 220V 8pcs', 'WSD fault Z-B/F-0108 · priority 3 - Critical
Purchase requisitions: PR-26-006393
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0109', 'Dh', 'Meedhoo', 'sewerage', 'Meedhoo Sewerage System', null, 'other', 'VACUUM INTERFACE UNIT SPARES', 'WSD fault Z-B/F-0109 · priority 3 - Critical
Purchase requisitions: PR-26-001487
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0110', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', 'RO-01', 'repair', 'SHELL RIMULA R4, 15W-40, SHELL RIMULA R4, 15W-40, 20L', 'WSD fault Z-B/F-0110 · priority 3 - Critical
Purchase requisitions: PR-26-006236
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0111', 'Th', 'Buruni', 'sewerage', 'Buruni Sewerage System', 'PS-01', 'repair', 'FLOAT SWITCH WITH 20M CABLE ( QTY:8)', 'WSD fault Z-B/F-0111 · priority 3 - Critical
Purchase requisitions: PR-26-006394
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0112', 'Th', 'Dhiyamigili', 'sewerage', 'Dhiyamigili Sewerage System', null, 'other', 'BATTERY FOR TRACTOR 70A', 'WSD fault Z-B/F-0112 · priority 3 - Critical
Purchase requisitions: PR-26-004741
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0120', 'Th', 'Guraidhoo', 'sewerage', 'Guraidhoo Sewerage System', null, 'other', 'BATTERY 12V, 100AMP FOR BOWSER-TRACTOR, MAINTENANCE FREE', 'WSD fault Z-B/F-0120 · priority 3 - Critical
Purchase requisitions: PR-26-006909
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', null, null),
  ('Z-B/F-0122', 'Th', 'Veymandoo', 'water', 'Veymandoo Water Plant', null, 'other', 'Shortage of water house connection material (EF TAPPING TEE 63MM x 32MM )', 'WSD fault Z-B/F-0122 · priority 1 - Normal
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-24', '2026-08-24'),
  ('Z-B/F-0124', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', null, 'other', 'Shortage of water house connection materials (PE BLUE PIPE (50M) )', 'WSD fault Z-B/F-0124 · priority 2 - High
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-30', '2026-08-30'),
  ('Z-B/F-0125', 'Th', 'Veymandoo', 'water', 'Veymandoo Water Plant', null, 'other', 'Shortage of water house connection materials (EF Fittings )', 'WSD fault Z-B/F-0125 · priority 1 - Normal
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-31', '2026-08-31'),
  ('Z-B/F-0126', 'Dh', 'Rinbidhoo', 'water', 'Rinbidhoo Water Plant', 'RO-01', 'repair', 'ITEMS REQUIRED FOR RO PLANT RECTIFICATION WORK- ( PRESSURE GUAGE 2,1/2" 1MPa/10BAR, WITHOUT BORDER ( BACK CONNECTION 1/4" THREADED ) & ( BOTTOM CONNECTION, 1/4" THREADED )', 'WSD fault Z-B/F-0126 · priority 2 - High
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-31', '2026-08-31'),
  ('Z-B/F-0127', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', null, 'other', 'SHORTAGE OF CHLORINE AND ANTISCALANT', 'WSD fault Z-B/F-0127 · priority 2 - High
Remarks: M01-F/IM/2026/102
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-31', '2026-08-31'),
  ('Z-B/F-0132', 'F', 'Dhranboodhoo', 'water', 'Dhranboodhoo Water Plant', 'RO-01', 'repair', 'NEED FLOAT SWITCH 2m For RO Plant', 'WSD fault Z-B/F-0132 · priority 2 - High
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-03', '2026-09-03'),
  ('Z-B/F-0134', 'Dh', 'Kudahuvadhoo', 'sewerage', 'Kudahuvadhoo Sewerage System', null, 'other', 'SEWER ITEM NEEDED FOR HARBOUR BUSINESS AREA - FOR NETWORK EXTENSION (UPVC SEWER PIPE DN110 ) Qty: 35', 'WSD fault Z-B/F-0134 · priority 1 - Normal
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-03', '2026-09-03'),
  ('Z-B/F-0136', 'F', 'Magoodhoo', 'sewerage', 'Magoodhoo Sewerage System', 'PS-02', 'repair', 'SYS-3 HOUR METER AC100-250V ( RUNNING HOURS METER & CHARCOAL ) for Sewer PS', 'WSD fault Z-B/F-0136 · priority 2 - High
Purchase requisitions: PR-26-004638
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-08', null),
  ('Z-B/F-0137', 'F', 'Magoodhoo', 'sewerage', 'Magoodhoo Sewerage System', null, 'other', 'KARCHER HIGH PRESSURE CLEANER K3 120BAR FOR PS CLEANING PURPOSE', 'WSD fault Z-B/F-0137 · priority 2 - High
Purchase requisitions: PR-26-004636
Remarks: PR: Pend. Approval - BUDG-APP
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-08', null),
  ('Z-B/F-0138', 'F', 'Magoodhoo', 'sewerage', 'Magoodhoo Sewerage System', 'PS-02', 'repair', 'ISO VG 32 Pump Oil FOR SEWER PS PUMP OIL CHANGE', 'WSD fault Z-B/F-0138 · priority 2 - High
Purchase requisitions: PR-26-004641
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-08', null),
  ('Z-B/F-0139', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', null, 'other', 'ROOFING SHEET 14FT FOR WATER TANK RECTIFICATION WORK', 'WSD fault Z-B/F-0139 · priority 3 - Critical
Purchase requisitions: PR-26-004758
Remarks: PO/2026/05578 ∙ Mnaam Private Limited ( PO: Completely Received )
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-20', '2026-08-20'),
  ('Z-B/F-0140', 'Dh', 'Rinbidhoo', 'water', 'Rinbidhoo Water Plant', 'ST-01', 'repair', 'THE STORAGE TANK HAS RUSTED. They require 15 Ltrs of Anti-corrosive food grade epoxy Paint to repair the rusted parts inside the water storage tanks.', 'WSD fault Z-B/F-0140 · priority 2 - High
Purchase requisitions: PR-26-007133
Remarks: RELEASED
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-09', null),
  ('Z-B/F-0146', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', null, 'other', 'Shortage of water connection fittings ( PF ADAPTER 20MMX1/2", PN16 )', 'WSD fault Z-B/F-0146 · priority 1 - Normal
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-06', '2026-09-06'),
  ('Z-B/F-0147', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', null, 'other', 'Shortage of water connection materials for 100 HOUSING UNIT PROJECT', 'WSD fault Z-B/F-0147 · priority 1 - Normal
Remarks: Petty Cash Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-07', '2026-09-07'),
  ('Z-B/F-0151', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', null, 'other', 'Shortage of water connection fittings (FOR HARBOR WATER CONNECTION )', 'WSD fault Z-B/F-0151 · priority 1 - Normal
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-07', '2026-09-07'),
  ('Z-B/F-0156', 'Th', 'Guraidhoo', 'water', 'Guraidhoo Water Plant', null, 'other', 'Shortage of water house connection fitting (SS PIPE SUPPORT BRACKET 38-40MM )', 'WSD fault Z-B/F-0156 · priority 1 - Normal
Remarks: Project Item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-08', '2026-09-08'),
  ('Z-B/F-0160', 'Th', 'Gaadhifushi', 'sewerage', 'Gaadhifushi Sewerage System', null, 'other', 'The sewer bowser pipe broke and has been sent to Malé for repair. ( HYDRAULIC PIPE ( Bowser Pipe ) RB2-19 ( 3/4" )', 'WSD fault Z-B/F-0160 · priority 2 - High
Remarks: Branch Memo: N09-B/IM/2026/33; SERVICE
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-08-17', '2026-09-09'),
  ('Z-B/F-0161', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', null, 'other', 'Shortage of water house connection fitting (WATER METER SET 15MM for Th. Vilufushi 100 Housing Unit Project. )', 'WSD fault Z-B/F-0161 · priority 1 - Normal
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-09', '2026-09-09'),
  ('Z-B/F-0162', 'Dh', 'Maaenboodhoo', 'sewerage', 'Maaenboodhoo Sewerage System', 'PS-02', 'repair', 'PS: 02 ( Outfall PS ) A Phase alarm is currently active, which is preventing the pumps from running, and station has now reached its critical alarm level.', 'WSD fault Z-B/F-0162 · priority 3 - Critical
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-13', '2026-09-13'),
  ('Z-B/F-0163', 'Dh', 'Kudahuvadhoo', 'sewerage', 'Kudahuvadhoo Sewerage System', null, 'other', 'Shortage of sewer connection fittings for the sewer extension work, (CORRUGATED PIPE 315MM (LENGTH 3M) )', 'WSD fault Z-B/F-0163 · priority 2 - High
Remarks: Project Item. Branch memo no: M08-F/IM/2026/209
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-09', '2026-09-09'),
  ('Z-B/F-0165', 'F', 'Magoodhoo', 'sewerage', 'Magoodhoo Sewerage System', null, 'other', 'A sewer manhole cover was damaged after being run over by MTCC heavy vehicle.', 'WSD fault Z-B/F-0165 · priority 2 - High
Remarks: Branch memo: L04-G/IM/2026/040
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-09-09', null),
  ('Z-B/F-0166', 'Dh', 'Hulhudheli', 'sewerage', 'Hulhudheli Sewerage System', 'PS-03', 'repair', 'The main cable at Pump Station 03 has been damaged and needs to be replaced as soon as possible. The required cable length is 26m (16sqmm).', 'WSD fault Z-B/F-0166 · priority 3 - Critical
Purchase requisitions: PR-26-007163
Remarks: Branch Memo: M04-F/IM/2026/073 ( EPR Number 51_2026 )
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-13', null),
  ('Z-B/F-0167', 'Dh', 'Hulhudheli', 'sewerage', 'Hulhudheli Sewerage System', 'PS-03', 'repair', 'One pump is not running, and the flow rate of the other pump is significantly low. Therefore, an additional submersible pump is currently being used to carry out day-to-day flush-outs.', 'WSD fault Z-B/F-0167 · priority 3 - Critical
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-09-16', null),
  ('Z-B/F-0168', 'Th', 'Veymandoo', 'water', 'Veymandoo Water Plant', 'ST-01', 'repair', 'The storage tanks are rusted, and the issue has remained unresolved for two years. Anti-corrosive, food-grade epoxy paint is needed to repair the rusted parts inside the tanks.', 'WSD fault Z-B/F-0168 · priority 3 - Critical
Purchase requisitions: PR-26-003198
Remarks: CRITICAL ISSUE
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-16', null),
  ('Z-B/F-0169', 'Th', 'Veymandoo', 'water', 'Veymandoo Water Plant', 'ST-01', 'repair', 'Complaints are being received regarding unusual water discoloration, which is reportedly caused by the corroded storage tanks. Anti-corrosive, food-grade epoxy paint is needed to resolve this criti…', 'Complaints are being received regarding unusual water discoloration, which is reportedly caused by the corroded storage tanks. Anti-corrosive, food-grade epoxy paint is needed to resolve this critical issue.
WSD fault Z-B/F-0169 · priority 3 - Critical
Purchase requisitions: PR-26-003198
Remarks: CRITICAL ISSUE
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-16', null),
  ('Z-B/F-0170', 'Th', 'Veymandoo', 'water', 'Veymandoo Water Plant', 'RO-01', 'repair', 'MEMBRANE 8"is needed to replace the existing membranes, as the high conductivity issue still remains.', 'WSD fault Z-B/F-0170 · priority 3 - Critical
Purchase requisitions: PR-26-005207
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-16', null),
  ('Z-B/F-0171', 'Th', 'Veymandoo', 'water', 'Veymandoo Water Plant', null, 'other', 'Three Grundfos pumps have been sent to Malé for servicing, haven''t received yet.', 'WSD fault Z-B/F-0171 · priority 3 - Critical
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-09-16', null),
  ('Z-B/F-0174', 'Th', 'Thimarafushi', 'water', 'Thimarafushi Water Plant', 'ST-01', 'repair', 'There is a significant leak in the 900-ton water storage tank. The leak worsens as the water volume reaches 800 tons. This is critical as it is the only operational tank.', 'WSD fault Z-B/F-0174 · priority 3 - Critical
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-09-16', null),
  ('Z-B/F-0176', 'Dh', 'Kudahuvadhoo', 'sewerage', 'Kudahuvadhoo Sewerage System', null, 'other', 'Shortage of Sewer connection materials', 'WSD fault Z-B/F-0176 · priority 2 - High
Purchase requisitions: PR-26-007166
Imported from the Water & Sewerage fault log (Oct 2026).', 'awaiting_parts', '2026-09-16', null),
  ('Z-B/F-0179', 'Dh', 'Kudahuvadhoo', 'water', 'Kudahuvadhoo Water Plant', null, 'other', 'Low water pressure complaints in the distribution network.', 'WSD fault Z-B/F-0179 · priority 2 - High
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-09-17', null),
  ('Z-B/F-0180', 'Dh', 'Hulhudheli', 'sewerage', 'Hulhudheli Sewerage System', 'PS-03', 'repair', 'Two sewerage pumps (Flygt, Model: 3085.160-1510954) were sent to Malé on 6th February 2024 and haven''t been received yet.', 'WSD fault Z-B/F-0180 · priority 2 - High
Remarks: Service Request form no: SVR/DH-HUD/2024/0062 , Branch Memo: M04-F/IM/2024/074
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-09-17', null),
  ('Z-B/F-0181', 'Th', 'Vilufushi', 'water', 'Vilufushi Water Plant', null, 'other', 'A complaint was received regarding unusual water discoloration.', 'WSD fault Z-B/F-0181 · priority 3 - Critical
Imported from the Water & Sewerage fault log (Oct 2026).', 'in_progress', '2026-09-17', null),
  ('Z-B/F-0183', 'Th', 'Veymandoo', 'water', 'Veymandoo Water Plant', null, 'other', 'Shortage of water house connection fitting (EF TAPPING TEE ( SADDLE ) & REDUCER )', 'WSD fault Z-B/F-0183 · priority 1 - Normal
Remarks: Project & Petty cash item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-14', '2026-09-14'),
  ('Z-B/F-0185', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', null, 'other', 'Shortage of water connection materials for network extension ( Fittings )', 'WSD fault Z-B/F-0185 · priority 1 - Normal
Remarks: Project item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-15', '2026-09-15'),
  ('Z-B/F-0187', 'Dh', 'Meedhoo', 'water', 'Meedhoo Water Plant', null, 'other', 'Shortage of water connection materials for network extension ( PIPE )', 'WSD fault Z-B/F-0187 · priority 1 - Normal
Remarks: Project item
Imported from the Water & Sewerage fault log (Oct 2026).', 'completed', '2026-09-15', '2026-09-15');

insert into work_orders (island_id, facility_id, asset_id, service, kind, title, description, status, started_on, completed_on, external_ref)
select i.id, f.id, s.id, w.service, w.kind, w.title, w.description, w.status, w.started_on, w.completed_on, w.ref
  from wsd_work w
  join atolls a on a.code = w.atoll join islands i on i.atoll_id = a.id and i.name = w.island
  left join facilities f on f.island_id = i.id and f.name = w.facility
  left join assets s on s.facility_id = f.id and s.tag = w.asset_tag
on conflict (external_ref) where external_ref is not null do nothing;

create temporary table wsd_updates (ref text, seq int, on_date date, body text) on commit drop;
insert into wsd_updates values
  ('Z-B/F-0001', 0, '2026-07-21', 'Purchase Requisition added'),
  ('Z-B/F-0001', 1, '2026-09-10', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-1015 ( Qty: 02 )'),
  ('Z-B/F-0002', 0, '2026-07-21', 'The branch was informed to identify the requirements for the new connection and create the PR afterward.'),
  ('Z-B/F-0004', 0, '2026-07-21', 'THIS ITEM WAS TRANSFERRED FROM DH. KUDAHUVADHOO TO DH. BANDIDHOO ( FNK-F03/F/2026/734 )'),
  ('Z-B/F-0005', 0, '2026-07-22', 'The Dh. Kudahuvadhoo branch supervisor is scheduled to travel to Dh. Rinbudhoo from 26 to 28 July 2026 to rectify a leak in the RO plant distribution pump pipe.'),
  ('Z-B/F-0005', 1, '2026-08-20', 'The Dh. Kudahuvadhoo branch supervisor traveled to Dh. Rinbudhoo and completed the work.'),
  ('Z-B/F-0007', 0, '2026-07-22', 'The branch was informed to identify the requirements for the new connection and create the PR afterward.'),
  ('Z-B/F-0008', 0, '2026-07-22', 'The branch has been informed to create a PR for this'),
  ('Z-B/F-0009', 0, '2026-07-22', 'The branch has been informed to create a PR for this'),
  ('Z-B/F-0010', 0, '2026-07-22', 'Purchase Requisition added'),
  ('Z-B/F-0013', 0, '2026-07-22', 'The branch has been informed to identify the issue and add a PR afterward.'),
  ('Z-B/F-0014', 0, '2026-07-22', 'The branch has been informed to create a PR for this'),
  ('Z-B/F-0015', 0, '2026-07-22', 'The branch has been informed to create a PR for this'),
  ('Z-B/F-0017', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0021', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0022', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0024', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0024', 1, '2026-07-23', 'This PR has been cancelled. The branch was notified that the task is CAD-related'),
  ('Z-B/F-0027', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0028', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0031', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0032', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0033', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0034', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0035', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0038', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0039', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0040', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0041', 0, '2026-07-23', 'Purchase Requisition added'),
  ('Z-B/F-0043', 0, '2026-07-25', 'The branch has been informed to create a PR for this'),
  ('Z-B/F-0043', 1, '2026-07-09', 'The required items have been transferred from Th. Dhiyamigili to the island. Transfer Form no: FNK-F03/F/2026/675'),
  ('Z-B/F-0044', 0, '2026-07-26', 'MATERIALS TRANSFERRED FROM R. MADUVVARI TO DH. KUDAHUVADHOO -FNK-F03-F-2026-0695 and TRANSFERRED FROM R. HULHUDHUFFAARU TO DH. KUDAHUVADHOO FNK-F03-F-2026-0694'),
  ('Z-B/F-0047', 0, null, 'Purchase Requisition added'),
  ('Z-B/F-0049', 0, '2026-07-25', 'The Dh. Kudahuvadhoo branch supervisor traveled to Th. Guraidhoo and completed the work.'),
  ('Z-B/F-0049', 1, '2026-07-30', 'The required materials were transferred from Dh. Kudahuvadhoo to the island. FNK-F03-F-2026-0772'),
  ('Z-B/F-0051', 0, '2026-07-25', 'The Dh. Kudahuvadhoo branch supervisor traveled to Th. Guraidhoo and completed the work.'),
  ('Z-B/F-0053', 0, '2026-08-09', 'Two sizes of EF end caps were bought using petty cash and transferred to the island (Form number: FNK-F03-F-2026-0814)."'),
  ('Z-B/F-0054', 0, '2026-08-09', 'The required materials were transferred to the island under Transfer Form Number: FNK-F03-F-2026-0817'),
  ('Z-B/F-0056', 0, '2026-08-10', 'Chlorine 25L has been transferred to the island from Th. Veymandoo. Transfer form number: FNK-F03-F-2026-0824'),
  ('Z-B/F-0059', 0, '2026-08-12', 'Required items were transferred from Th. Vilufushi to Th. Gaadhiffushi, Transfer form number: FNK-F03-F-2026-0830'),
  ('Z-B/F-0061', 0, '2026-08-10', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0832'),
  ('Z-B/F-0062', 0, '2026-08-11', 'Chlorine 25L has been transferred to the island from Th. Veymandoo. Transfer form number: FNK-F03-F-2026-0834'),
  ('Z-B/F-0063', 0, '2026-08-11', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0835'),
  ('Z-B/F-0064', 0, '2026-08-11', 'The required materials were transferred to the island under Transfer Form Number: FNK-F03-F-2026-0839 - TH. Vilushi to Thimarafushi'),
  ('Z-B/F-0066', 0, '2026-08-13', 'Chlorine 25L & Antiscalant have been transferred to the island from F. Bileydhoo. Transfer form number:FNK-F03-F-2026-0845'),
  ('Z-B/F-0067', 0, '2026-08-13', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0852'),
  ('Z-B/F-0068', 0, '2026-08-16', 'The required materials were transferred to the island under Transfer Form Number: FNK-F03-F-2026-0853 - R. Maduvvari to Th. Hirilandhoo'),
  ('Z-B/F-0070', 0, '2026-08-16', 'The required materials were transferred to the island under Transfer Form Number: FNK-F03-F-2026-0855 - WSD to Th. Hirilandhoo'),
  ('Z-B/F-0071', 0, '2026-08-17', 'The required item has been transferred from L. Maavah to the island. Transfer Form no: FNK-F03-F-2026-0863'),
  ('Z-B/F-0072', 0, '2026-08-17', 'The required materials were transferred to the island under Transfer Form Number: FNK-F03-F-2026-0867 - Dh. Kudahuvadhoo to Dh. Rinbudhoo'),
  ('Z-B/F-0073', 0, '2026-08-17', 'The required item has been transferred from F. Bileydhoo to the island. Transfer Form no: FNK-F03-F-2026-0868'),
  ('Z-B/F-0074', 0, '2026-08-18', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0870'),
  ('Z-B/F-0077', 0, '2026-08-19', 'The required item has been transferred from R.Maduvvari to the island. Transfer Form no: FNK-F03-F-2026-0880'),
  ('Z-B/F-0078', 0, '2026-08-19', 'The required item has been transferred from R.Maduvvari to the island. Transfer Form no: FNK-F03-F-2026-0881'),
  ('Z-B/F-0079', 0, '2026-08-19', 'The required items have been transferred from Dh. Kudahuvadhoo to the island. Transfer Form no: FNK-F03-F-2026-0882'),
  ('Z-B/F-0080', 0, '2026-08-19', 'The required item has been transferred from Dh. Hulhudeli to the island. Transfer Form no: FNK-F03-F-2026-0883'),
  ('Z-B/F-0088', 0, '2026-08-24', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0898'),
  ('Z-B/F-0090', 0, '2026-08-24', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0908'),
  ('Z-B/F-0091', 0, '2026-08-24', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0909'),
  ('Z-B/F-0102', 0, null, 'Purchase Requisition added'),
  ('Z-B/F-0103', 0, null, 'Purchase Requisition added / A MEMO WAS SENT TO THE PROCUREMENT DEPARTMENT'),
  ('Z-B/F-0104', 0, null, 'Purchase Requisition added / A MEMO WAS SENT TO THE PROCUREMENT DEPARTMENT'),
  ('Z-B/F-0105', 0, null, 'Purchase Requisition added / A MEMO WAS SENT TO THE PROCUREMENT DEPARTMENT'),
  ('Z-B/F-0106', 0, null, 'Purchase Requisition added / A MEMO WAS SENT TO THE PROCUREMENT DEPARTMENT'),
  ('Z-B/F-0107', 0, null, 'Purchase Requisition added'),
  ('Z-B/F-0108', 0, null, 'Purchase Requisition added'),
  ('Z-B/F-0109', 0, null, 'Purchase Requisition added / A MEMO WAS SENT TO THE PROCUREMENT DEPARTMENT'),
  ('Z-B/F-0110', 0, null, 'Purchase Requisition added / A MEMO WAS SENT TO THE PROCUREMENT DEPARTMENT'),
  ('Z-B/F-0111', 0, null, 'Purchase Requisition added'),
  ('Z-B/F-0112', 0, null, 'Purchase Requisition added'),
  ('Z-B/F-0120', 0, null, 'Purchase Requisition added'),
  ('Z-B/F-0122', 0, '2026-08-24', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0902'),
  ('Z-B/F-0124', 0, '2026-08-30', 'The required item has been transferred from Th. Dhiyamigili to the island. Transfer Form no: FNK-F03-F-2026-0925'),
  ('Z-B/F-0125', 0, '2026-08-31', 'The required items have been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-00926'),
  ('Z-B/F-0126', 0, '2026-08-31', 'The required items have been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-00929'),
  ('Z-B/F-0127', 0, '2026-08-31', 'The required items have been transferred from Dh. Kudahuvadhoo to the island. Transfer Form no: FNK-F03-F-2026-00930'),
  ('Z-B/F-0132', 0, '2026-09-03', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-0964'),
  ('Z-B/F-0134', 0, '2026-09-03', 'The required item has been transferred from L. Maavah to the island. Transfer Form no: FNK-F03-F-2026-0968'),
  ('Z-B/F-0136', 0, '2026-09-08', 'Purchase Requisition added'),
  ('Z-B/F-0137', 0, '2026-09-08', 'Purchase Requisition added'),
  ('Z-B/F-0138', 0, '2026-09-08', 'Purchase Requisition added'),
  ('Z-B/F-0139', 0, '2026-08-20', 'Purchase Requisition added'),
  ('Z-B/F-0140', 0, '2026-09-09', 'Purchase Requisition added'),
  ('Z-B/F-0146', 0, '2026-09-06', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-00979'),
  ('Z-B/F-0147', 0, '2026-09-07', 'The required items have been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-00983'),
  ('Z-B/F-0151', 0, '2026-09-07', 'The required items have been transferred from WSD to the island. Transfer Form no: FNK-F03/F/2026/992'),
  ('Z-B/F-0156', 0, '2026-09-08', 'The required item has been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-1002'),
  ('Z-B/F-0160', 0, '2026-08-17', 'They have been informed to send the service form.'),
  ('Z-B/F-0160', 1, '2026-09-09', 'The repaired item has been transferred from the FENAKA workshop to the island under Transfer Form No. FNK-F03-F-2026-1011'),
  ('Z-B/F-0161', 0, '2026-09-09', 'The required items have been transferred from Th. Vilufushi to Th. Vilufushi to Th. Vilufushi 100 Housing Unit Project. Transfer Form no: FNK-F03/F/2026/1012'),
  ('Z-B/F-0162', 0, '2026-09-13', 'After tightening the loose screws and bolts, the problem was solved.'),
  ('Z-B/F-0163', 0, '2026-09-09', 'The required item has been transferred from R. Maduvvari to the island. Transfer Form no: FNK-F03-F-2026-1013'),
  ('Z-B/F-0166', 0, '2026-09-13', 'Purchase Requisition added'),
  ('Z-B/F-0167', 0, '2026-09-16', 'I have informed the branch to send the damaged pump to Malé for servicing.'),
  ('Z-B/F-0168', 0, '2026-09-16', 'A purchase requisition has been added.'),
  ('Z-B/F-0169', 0, '2026-09-16', 'A purchase requisition has been added.'),
  ('Z-B/F-0170', 0, '2026-09-16', 'Purchase Requisition added'),
  ('Z-B/F-0176', 0, '2026-09-16', 'Purchase Requisition added'),
  ('Z-B/F-0181', 0, '2026-09-17', 'Muhaz will attend to the issue'),
  ('Z-B/F-0183', 0, '2026-09-14', 'The required items have been transferred from WSD to the island. Transfer Form no: FNK-F03-F-2026-1016'),
  ('Z-B/F-0185', 0, '2026-09-15', 'The required items have been transferred from R. Hulhudhuffaar to the island. Transfer Form no: FNK-F03-F-2026-1025'),
  ('Z-B/F-0187', 0, '2026-09-15', 'The required item has been transferred from R. Maduvvari to the island. Transfer Form no: FNK-F03-F-2026-1027');

-- Only for work created just now (not on a second run).
insert into work_updates (work_id, body, created_at)
select w.id, u.body, coalesce((u.on_date + time '12:00' + u.seq * interval '1 minute') at time zone 'Indian/Maldives', now())
  from wsd_updates u join work_orders w on w.external_ref = u.ref
 where not exists (select 1 from work_updates x where x.work_id = w.id);

create temporary table psip_projects (atoll text, island text, title text, description text, status project_state, progress numeric,
  contractor text, start_date date, target_date date, notes text) on commit drop;
insert into psip_projects values
  ('Th', 'Vandhoo', 'Development of Futsal Ground', 'Client: Minister of Youth Empowerment, Sports and Fitness
Execution: In-House', 'ongoing', 90.0, null, null, '2026-10-08', 'Approximately 90% of the project has been completed.
The remaining paint materials have already been loaded onto the supply boat.
Materials are expected to arrive on the island by 4 October 2026.
Final painting and touch-up works will be carried out upon receipt of the materials.
Expected project completion date: 8 October 2026.'),
  ('F', 'Bilehdhoo', 'Development of Police post', 'Client: Maldives Police Service
Execution: In-House', 'on_hold', 15.0, null, null, null, 'Required materials have been requested, and the Purchase Order (PO) has been created.
Material supply is currently on hold due to outstanding issues with STO.
Following the transition from Fenaka to STELCO, prior approval is required for the procurement of all necessary materials.
Ongoing labor costs are being incurred despite the lack of work progress.
The continued delay is resulting in additional project costs and potential losses.
Management intervention is required to expedite material approval and supply arrangements to avoid further delays and financial impact.'),
  ('F', 'Feeali', 'Development of Police post', 'Client: Maldives Police Service
Execution: In-House', 'on_hold', 20.0, null, null, null, 'Required materials have been requested, and the Purchase Order (PO) has been created.
Material supply is currently on hold due to outstanding issues with STO.
Following the transition from Fenaka to STELCO, prior approval is required for the procurement of all necessary materials.
Ongoing labor costs are being incurred despite the lack of work progress.
The continued delay is resulting in additional project costs and potential losses.
Management intervention is required to expedite material approval and supply arrangements to avoid further delays and financial impact.'),
  ('F', 'Magoodhoo', 'Development of Police post', 'Client: Maldives Police Service
Execution: In-House', 'on_hold', 18.0, null, null, null, 'Required materials have been requested, and the Purchase Order (PO) has been created.
Material supply is currently on hold due to outstanding issues with STO.
Following the transition from Fenaka to STELCO, prior approval is required for the procurement of all necessary materials.
Ongoing labor costs are being incurred despite the lack of work progress.
The continued delay is resulting in additional project costs and potential losses.
Management intervention is required to expedite material approval and supply arrangements to avoid further delays and financial impact.'),
  ('Th', 'Omadhoo', 'Development of Police post', 'Client: Maldives Police Service
Execution: In-House', 'on_hold', 10.0, null, null, null, 'Required materials have been requested, and the Purchase Order (PO) has been created.
Material supply is currently on hold due to outstanding issues with STO.
Following the transition from Fenaka to STELCO, prior approval is required for the procurement of all necessary materials.
Ongoing labor costs are being incurred despite the lack of work progress.
The continued delay is resulting in additional project costs and potential losses.
Management intervention is required to expedite material approval and supply arrangements to avoid further delays and financial impact.'),
  ('Dh', 'Rinbidhoo', 'Upgrading of Dh.Rinbidhoo Health centre', 'Client: Ministry of Health
Execution: Outsourced
Progress: pending site mobilization', 'ongoing', 0, 'Waleed Construction', '2026-08-20', '2027-08-20', 'Site clearing works commenced on 20 August 2026.
Site setting-out has been completed, and the project is ready to commence groundwork activities next week.
All required materials are available on site.
Project completion is scheduled for 20 August 2027.');

with new as (
  insert into projects (island_id, project_type, title, description, status, progress_pct, contractor, start_date, target_date, visibility)
  select i.id, 'infrastructure', x.title, x.description, x.status, round(x.progress), x.contractor, x.start_date, x.target_date, 'everyone'
    from psip_projects x join atolls a on a.code = x.atoll join islands i on i.atoll_id = a.id and i.name = x.island
   where not exists (select 1 from projects p where p.island_id = i.id and p.title = x.title)
  returning id, island_id, title)
insert into project_updates (project_id, body)
select n.id, x.notes from new n join islands i on i.id = n.island_id join atolls a on a.id = i.atoll_id
  join psip_projects x on x.atoll = a.code and x.island = i.name and x.title = n.title;
