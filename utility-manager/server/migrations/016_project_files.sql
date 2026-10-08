-- Files kept with a project only while it is open (Oct 2026).
-- Added while the project is planned / ongoing / on hold. When it is
-- completed or cancelled, files can still be downloaded (or deleted at once)
-- for 30 days, then the daily job deletes them so they don't take up storage
-- for good. Reopening the project cancels the deletion.

create table project_files (
  id           bigint generated always as identity primary key,
  project_id   bigint not null references projects(id) on delete cascade,
  file_name    text not null,
  content_type text not null,
  size_bytes   integer not null,
  data         bytea not null,
  uploaded_by  uuid references users(id) on delete set null,
  uploaded_at  timestamptz not null default now()
);
create index project_files_project_idx on project_files (project_id);

alter table projects add column files_delete_after date;

create function project_files_countdown() returns trigger language plpgsql as $$
begin
  if new.status in ('completed', 'cancelled') then
    if tg_op = 'INSERT' or old.status not in ('completed', 'cancelled') then
      new.files_delete_after := current_date + 30;
    end if;
  else
    new.files_delete_after := null;
  end if;
  return new;
end $$;
create trigger projects_files_countdown before insert or update of status on projects
for each row execute function project_files_countdown();

-- Projects already closed: start their countdown now.
update projects set files_delete_after = current_date + 30 where status in ('completed', 'cancelled');
