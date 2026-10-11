-- Units of the department (Oct 2026).
--
-- Every member of staff except the General Manager belongs to one unit
-- (set by an administrator on the Users page). Work and projects can be
-- assigned to a unit; members of a project's unit can view the project.

create table units (
  id         smallint generated always as identity primary key,
  name       text not null unique,
  sort_order smallint not null default 100
);
insert into units (name, sort_order) values
  ('Mechanical Unit', 1),
  ('Electrical Unit', 2),
  ('General Maintenance Unit', 3),
  ('Administration and Support Service Unit', 4),
  ('Logistics Unit', 5);

alter table users       add column unit_id smallint references units(id);
alter table work_orders add column unit_id smallint references units(id);
alter table projects    add column unit_id smallint references units(id);
create index work_orders_unit_idx on work_orders (unit_id) where unit_id is not null;
create index projects_unit_idx on projects (unit_id) where unit_id is not null;
