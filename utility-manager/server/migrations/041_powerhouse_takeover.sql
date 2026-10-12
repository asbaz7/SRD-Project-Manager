-- The Powerhouse Takeover project (South Regional Department, Admin Works),
-- from powerhouse_takeover_seed.json (the NEW POWERHOUSE TAKEOVER PROJECT
-- workbook): 26 tasks, and for each island taken over (every island in F,
-- Dh and Th with a powerhouse, water or sewerage plant) the systems to get
-- access to and the diesel, safety PPE and stationery checklists.
-- Owner: the Administration unit head; visible to that unit and the people
-- added to it. Safe to run again: everything is keyed (task code, item).

insert into projects (title, description, status, project_type, unit_id, owner_id, visibility, progress_pct)
select 'Powerhouse Takeover',
       'Taking over the powerhouses of F, Dh and Th atolls, with their water and sewerage services. Admin Works tasks, rights and access per site, and the diesel, safety PPE and stationery checklists for each powerhouse. From the NEW POWERHOUSE TAKEOVER PROJECT workbook.',
       'ongoing', 'office_cs',
       (select id from units where name = 'Administration and Support Service Unit'),
       (select head_user_id from units where name = 'Administration and Support Service Unit'),
       'members', 0
 where not exists (select 1 from projects where title = 'Powerhouse Takeover');


insert into project_tasks (project_id, position, code, source_no, category, name, action, responsible_dept, unit_id,
                           priority, status, progress, start_date, due_date, completed_date, assigned_to, remarks)
select tko.id, v.position, v.code, v.source_no, v.category, v.name, v.action, v.dept, u.id,
       v.priority, v.status, v.progress, v.start_date::date, v.due_date::date, v.completed_date::date, v.assigned_to, v.remarks
  from (select id from projects where title = 'Powerhouse Takeover') tko, (values
  (1, 'TKO-001', '1', 'Admin Works', 'Prepare outstation allowance for temp in-charge allocated from department (if allocated)', 'Prepare allowance form and submit for e-signatures', 'Department', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (2, 'TKO-002', '1', 'Admin Works', 'Transfer rights manager rights to the temp in-charge allocated by department', 'Mail to relevant departments (Corporate, Billing, IT, Finance, HR)', 'Department', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, 'Source also numbered #1'),
  (3, 'TKO-003', '2', 'Admin Works', 'Hand over staff ID cards in coordination with HR', 'Coordinate with HR', 'HR', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (4, 'TKO-004', '3', 'Admin Works', 'Create a domain and provide email access to relevant staff', 'Mail to helpdesk (IT)', 'IT', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (5, 'TKO-005', '4', 'Admin Works', 'Provide access to all admin-related software used', 'Coordinate with relevant departments (Corporate, Billing, IT, Finance, HR)', 'Department', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, 'See Rights & Access sheet'),
  (6, 'TKO-006', '5', 'Admin Works', 'Request and provide safety shoes and boiler suits for technical staff and uniforms for all staff', 'Request to store (via ERP) and coordinate with HR', 'Store', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (7, 'TKO-007', '6', 'Admin Works', 'Provide assets and stationery required for admin operations (pen, puncher, ruler, books)', 'Request to store', 'Store', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, 'See Stationery sheet'),
  (8, 'TKO-008', '6', 'Admin Works', 'Provide assets required for financial operations (safe and cash drawer)', 'Request to Finance', 'Finance', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, 'Unnumbered row in source'),
  (9, 'TKO-009', '7', 'Admin Works', 'Provide tools required for inventory management (number printer)', 'Request to Finance', 'Finance', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, 'Check: other supplies route to Store'),
  (10, 'TKO-010', '8', 'Admin Works', 'Implement an attendance monitoring system', 'Coordinate with IT & HR', 'IT', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (11, 'TKO-011', '9', 'Admin Works', 'Share internal record-keeping and monitoring sheets (work planning, scheduling and reporting formats)', 'Provide to powerhouses', 'Powerhouse', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, null),
  (12, 'TKO-012', '10', 'Admin Works', 'Request and provide a full safety kit', 'Request to Corporate (Safety Unit)', 'Corporate (Safety Unit)', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, 'See Safety PPE sheet'),
  (13, 'TKO-013', '11', 'Admin Works', 'Fire safety system upgrade', 'Request to Corporate (Safety Unit)', 'Corporate (Safety Unit)', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (14, 'TKO-014', '12', 'Admin Works', 'Arrange petty cash for powerhouses', 'Coordinate with Finance (Ali Riza)', 'Finance', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (15, 'TKO-015', '13', 'Admin Works', 'Share safety instruction memos with all staff', 'Provide to powerhouses', 'Powerhouse', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, null),
  (16, 'TKO-016', '14', 'Admin Works', 'Share updated company SOPs and obtain signatures from all staff acknowledging receipt', 'Provide to powerhouses', 'Powerhouse', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, null),
  (17, 'TKO-017', '15', 'Admin Works', 'Ensure staff read the handbook for powerhouse operations and company policies', null, 'Powerhouse', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, 'Action not specified in source'),
  (18, 'TKO-018', '16', 'Admin Works', 'Complete all Job Descriptions (JDs)', 'Coordinate with HR', 'HR', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, null),
  (19, 'TKO-019', '17', 'Admin Works', 'Inform the temporary manager to meet each staff member individually and record their concerns', 'Inform powerhouses', 'Powerhouse', 'Administration and Support Service Unit', 2, 'Not Started', 0, null, null, null, null, null),
  (20, 'TKO-020', '18', 'Admin Works', 'Allocate roles: Water In-Charge, Technical In-Charge, Admin Support. Give existing leaders the opportunity to perform and instruct the manager to monitor them', null, 'Department', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, 'Action not specified in source'),
  (21, 'TKO-021', '19', 'Admin Works', 'Submit requests for installation of security camera systems where required', 'Request to IT', 'IT', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (22, 'TKO-022', '20', 'Admin Works', 'Review and update regional focal point structures', null, 'Department', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, 'Action not specified in source'),
  (23, 'TKO-023', '21', 'Admin Works', 'Share the details of focal points for water and distribution', 'Provide to powerhouses (coordinate with T&D and Water)', 'Powerhouse', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (24, 'TKO-024', '22', 'Admin Works', 'Provide MIS rights for all technical staff, and manager rights to technical in-charge and manager', 'Mail to helpdesk (IT)', 'IT', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (25, 'TKO-025', '23', 'Admin Works', 'Share access to diesel book to technical in-charge and manager', 'Provide access from department', 'Department', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null),
  (26, 'TKO-026', '24', 'Admin Works', 'Provide log sheets for duty staff to record data', 'Provide to powerhouses', 'Powerhouse', 'Administration and Support Service Unit', 1, 'Not Started', 0, null, null, null, null, null)
  ) as v(position, code, source_no, category, name, action, dept, unit, priority, status, progress, start_date, due_date, completed_date, assigned_to, remarks)
  left join units u on u.name = v.unit
on conflict (project_id, code) where code is not null do nothing;

-- Rights and access, per site.
insert into project_access_items (project_id, island_id, position, system, granting_dept, status)
select tko.id, s.id, v.position, v.system, v.dept, v.status
  from (select id from projects where title = 'Powerhouse Takeover') tko, (select distinct i.id from islands i join atolls a on a.id = i.atoll_id join facilities f on f.island_id = i.id and f.active
          where i.active and a.code in ('F', 'Dh', 'Th') and f.service in ('electricity', 'water', 'sewerage')) s, (values
  (1, 'Human Resources Management System (HRMS)', 'HR', 'Not Requested'),
  (2, 'Safe Manager', 'Finance', 'Not Requested'),
  (3, 'EMnet', 'Corporate', 'Not Requested'),
  (4, 'Billing Program', 'CS Billing', 'Not Requested'),
  (5, 'ERP', 'IT', 'Not Requested'),
  (6, 'Helpdesk', 'IT', 'Not Requested'),
  (7, 'Management Information System (MIS)', 'IT', 'Not Requested'),
  (8, 'Card Machine', 'IT', 'Not Requested'),
  (9, 'Office PC', 'IT', 'Not Requested'),
  (10, 'CCTV Camera', 'IT', 'Not Requested')
  ) as v(position, system, dept, status)
on conflict do nothing;

-- Checklists, per site.
insert into project_checklist_items (project_id, island_id, list, position, item, required_qty, availability, remarks)
select tko.id, s.id, v.list, v.position, v.item, v.required_qty, v.availability, v.remarks
  from (select id from projects where title = 'Powerhouse Takeover') tko, (select distinct i.id from islands i join atolls a on a.id = i.atoll_id join facilities f on f.island_id = i.id and f.active
          where i.active and a.code in ('F', 'Dh', 'Th') and f.service in ('electricity', 'water', 'sewerage')) s, (values
  ('diesel', 1, 'Polyethylene tank', null::numeric, null, null::text),
  ('diesel', 2, 'Steel tank', null::numeric, null, null),
  ('diesel', 3, 'Day tanks', null::numeric, null, null),
  ('diesel', 4, 'Flow meter', null::numeric, null, null),
  ('diesel', 5, 'Transfer pump', null::numeric, null, null),
  ('diesel', 6, 'Sounding tape', null::numeric, null, null),
  ('diesel', 7, 'Sounding paste', null::numeric, null, null),
  ('diesel', 8, 'Water paste', null::numeric, null, null),
  ('diesel', 9, 'Fuel line (main)', null::numeric, null, null),
  ('diesel', 10, 'Fuel line (day tanks)', null::numeric, null, null),
  ('diesel', 11, 'Day tank quantity board', null::numeric, null, null),
  ('diesel', 12, 'Valve tag board', null::numeric, null, null),
  ('diesel', 13, 'Unloading board', null::numeric, null, null),
  ('safety_ppe', 1, 'Helmet', null::numeric, null, null),
  ('safety_ppe', 2, 'Safety goggles', null::numeric, null, null),
  ('safety_ppe', 3, 'Welding mask', null::numeric, null, null),
  ('safety_ppe', 4, 'Ear muffs', null::numeric, null, null),
  ('safety_ppe', 5, 'Respirator', null::numeric, null, null),
  ('safety_ppe', 6, 'Dust mask', null::numeric, null, null),
  ('safety_ppe', 7, 'Electrical gloves', null::numeric, null, null),
  ('safety_ppe', 8, 'Chemical gloves', null::numeric, null, null),
  ('safety_ppe', 9, 'Laboratory gloves', null::numeric, null, null),
  ('safety_ppe', 10, 'Welding gloves', null::numeric, null, null),
  ('safety_ppe', 11, 'Boiler suit', null::numeric, null, null),
  ('safety_ppe', 12, 'Chemical suit', null::numeric, null, null),
  ('safety_ppe', 13, 'Safety vest', null::numeric, null, null),
  ('safety_ppe', 14, 'Apron', null::numeric, null, null),
  ('safety_ppe', 15, 'Safety belt / harness', null::numeric, null, null),
  ('safety_ppe', 16, 'Knee pads', null::numeric, null, null),
  ('safety_ppe', 17, 'Safety shoes', null::numeric, null, null),
  ('safety_ppe', 18, 'Chemical shoes', null::numeric, null, null),
  ('stationery', 1, 'A4 paper', 15, null, null),
  ('stationery', 2, 'Ball point pen (blue)', 10, null, null),
  ('stationery', 3, 'Ball point pen (black)', 10, null, null),
  ('stationery', 4, 'Ball point pen (red)', 10, null, null),
  ('stationery', 5, 'Stapler small No. 10', 10, null, null),
  ('stationery', 6, 'Plastic ruler', 10, null, null),
  ('stationery', 7, 'Two-hole paper puncher', 5, 'Requested', null),
  ('stationery', 8, 'Pencil', 10, null, null),
  ('stationery', 9, 'Eraser', 10, null, null),
  ('stationery', 10, 'Scissors', 5, null, null),
  ('stationery', 11, 'Paper clip 25 mm', 2, null, null),
  ('stationery', 12, 'Paper clip 50 mm', 2, null, null),
  ('stationery', 13, 'Binder clip 19 mm (3/4 in)', 6, null, null),
  ('stationery', 14, 'Sticky note pad', 10, null, null),
  ('stationery', 15, 'Glue stick', 5, null, null),
  ('stationery', 16, 'Pen holder', 10, null, null),
  ('stationery', 17, 'Highlighter', 15, null, null),
  ('stationery', 18, 'Whiteboard marker 500 red', 5, 'Requested', null),
  ('stationery', 19, 'Whiteboard marker 500 black', 5, 'Requested', null),
  ('stationery', 20, 'Whiteboard marker 500 blue', 5, 'Requested', null),
  ('stationery', 21, 'Box file 3 in', 30, null, null),
  ('stationery', 22, '2-hole heavy duty paper puncher', 1, null, null),
  ('stationery', 23, 'Heavy duty table stapler', 1, null, null),
  ('stationery', 24, 'Printer cartridge & toner', null, null, 'Depends on the printer')
  ) as v(list, position, item, required_qty, availability, remarks)
on conflict do nothing;
