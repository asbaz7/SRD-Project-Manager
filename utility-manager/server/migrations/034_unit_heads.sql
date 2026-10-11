-- Unit heads (Oct 2026). A unit's head assigns its work to people in the
-- unit, runs the unit's work (even with a non-technical account) and is told
-- on Telegram when new work comes to the unit. The General Manager assigns
-- work to anyone.
alter table units add column head_user_id uuid references users(id) on delete set null;

update units u set head_user_id = p.id
  from (values ('Electrical Unit', 'Ali Nabeeh Waseem'),
               ('Mechanical Unit', 'Haisham Jaufar'),
               ('Administration and Support Service Unit', 'Aishath Fazla'),
               ('General Maintenance Unit', 'Ibrahim Khaleel')) as h(unit, person)
  join users p on p.full_name = h.person and p.active
 where u.name = h.unit;
