-- Project files (Oct 2026):
--   * versions: an edited copy uploaded over a file becomes its new version;
--     the older ones stay in its history. group_id is the first version's id
--     (null on a first version), only the newest is current.
--   * links: files kept in Microsoft 365 (OneDrive / SharePoint) and edited
--     there, linked from the project rather than uploaded.
alter table project_files
  add column group_id bigint references project_files(id) on delete cascade,
  add column version  integer not null default 1,
  add column current  boolean not null default true;
create index project_files_group_idx on project_files (group_id) where group_id is not null;

create table project_links (
  id         bigint generated always as identity primary key,
  project_id bigint not null references projects(id) on delete cascade,
  title      text not null,
  url        text not null check (url ~ '^https://'),
  added_by   uuid references users(id) on delete set null,
  added_at   timestamptz not null default now()
);
create index project_links_project_idx on project_links (project_id);
create trigger audit after insert or update or delete on project_links for each row execute function audit_row('project_id');
