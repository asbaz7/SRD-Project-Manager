-- Project task tracker (Oct 2026), first for the Powerhouse Takeover:
--   * project tasks gain tracker fields: a stable code (TKO-001), source
--     number, category, action, responsible department, unit, priority 1-4,
--     island, assignee, dates, status and remarks. All optional, so plain
--     task breakdowns are unchanged. Priority labels and "overdue" are worked
--     out, not stored.
--   * per-site lists for a project: systems to get access to, and checklists
--     (diesel, safety PPE, stationery), one set per island.

alter table project_tasks
  add column code             text,
  add column source_no        text,
  add column category         text,
  add column action           text,
  add column responsible_dept text check (responsible_dept in ('HR', 'IT', 'Finance', 'Corporate', 'Corporate (Safety Unit)',
                                          'CS Billing', 'Store', 'Department', 'Powerhouse', 'T&D', 'Water')),
  add column unit_id          smallint references units(id),
  add column priority         smallint check (priority between 1 and 4),
  add column island_id        uuid references islands(id),
  add column assigned_user_id uuid references users(id) on delete set null,
  add column assigned_to      text,
  add column start_date       date,
  add column due_date         date,
  add column status           text check (status in ('Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled')),
  add column completed_date   date,
  add column remarks          text,
  add column updated_at       timestamptz not null default now();
create unique index project_tasks_code_idx on project_tasks (project_id, code) where code is not null;
create trigger project_tasks_touch before update on project_tasks for each row execute function touch_updated_at();

-- Overall progress: the average of the tasks, leaving out cancelled ones.
create or replace function project_progress_from_tasks() returns trigger language plpgsql as $$
declare
  pid bigint := coalesce(new.project_id, old.project_id);
begin
  update projects p
     set progress_pct = coalesce((select round(avg(t.progress), 1) from project_tasks t
                                   where t.project_id = pid and t.status is distinct from 'Cancelled'), 0)
   where p.id = pid and exists (select 1 from project_tasks t where t.project_id = pid);
  return null;
end $$;

-- Systems staff at a site need access to, and who grants it.
create table project_access_items (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references projects(id) on delete cascade,
  island_id     uuid references islands(id),
  position      integer not null,
  system        text not null,
  granting_dept text,
  status        text not null default 'Not Requested' check (status in ('Not Requested', 'Requested', 'Granted', 'Rejected')),
  requested_on  date,
  granted_on    date,
  granted_to    text,
  remarks       text,
  updated_at    timestamptz not null default now()
);
create index project_access_items_idx on project_access_items (project_id, island_id, position);
create unique index project_access_items_key on project_access_items (project_id, coalesce(island_id, '00000000-0000-0000-0000-000000000000'), system);
create trigger audit after insert or update or delete on project_access_items for each row execute function audit_row('project_id');
create trigger project_access_items_touch before update on project_access_items for each row execute function touch_updated_at();

-- Checklists: diesel and safety PPE (availability and quantity), stationery
-- (required and available quantity; the shortfall is worked out).
create table project_checklist_items (
  id            bigint generated always as identity primary key,
  project_id    bigint not null references projects(id) on delete cascade,
  island_id     uuid references islands(id),
  list          text not null check (list in ('diesel', 'safety_ppe', 'stationery')),
  position      integer not null,
  item          text not null,
  availability  text check (availability in ('Available', 'Not Available', 'Partial', 'Requested')),
  quantity      numeric check (quantity >= 0),
  required_qty  numeric check (required_qty >= 0),
  available_qty numeric check (available_qty >= 0),
  remarks       text,
  updated_at    timestamptz not null default now()
);
create index project_checklist_items_idx on project_checklist_items (project_id, island_id, list, position);
create unique index project_checklist_items_key on project_checklist_items (project_id, coalesce(island_id, '00000000-0000-0000-0000-000000000000'), list, item);
create trigger audit after insert or update or delete on project_checklist_items for each row execute function audit_row('project_id');
create trigger project_checklist_items_touch before update on project_checklist_items for each row execute function touch_updated_at();
