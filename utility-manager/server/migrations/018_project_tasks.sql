-- Projects reworked to the department's form (Oct 2026):
--   * a project type (mechanical, electrical, infrastructure, office/CS,
--     maintenance, store, workshop, staff area); service becomes optional
--   * a task breakdown; overall progress is the average of the tasks
--     (equal weighting), to one decimal place, kept up to date by trigger

alter table projects add column project_type text
  check (project_type in ('mechanical', 'electrical', 'infrastructure', 'office_cs', 'maintenance', 'store', 'workshop', 'staff_area'));
alter table projects alter column service drop not null;
alter table projects alter column progress_pct type numeric(5, 1);
alter table project_updates alter column progress_pct type numeric(5, 1);

create table project_tasks (
  id         bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  position   integer not null,
  name       text not null,
  progress   numeric(5, 1) not null default 0 check (progress between 0 and 100)
);
create index project_tasks_project_idx on project_tasks (project_id, position);
create trigger audit after insert or update or delete on project_tasks for each row execute function audit_row('project_id');

-- Overall progress follows the tasks (when there are any).
create function project_progress_from_tasks() returns trigger language plpgsql as $$
declare
  pid bigint := coalesce(new.project_id, old.project_id);
begin
  update projects p
     set progress_pct = (select round(avg(t.progress), 1) from project_tasks t where t.project_id = pid)
   where p.id = pid and exists (select 1 from project_tasks t where t.project_id = pid);
  return null;
end $$;
create trigger project_tasks_progress after insert or update or delete on project_tasks
for each row execute function project_progress_from_tasks();
