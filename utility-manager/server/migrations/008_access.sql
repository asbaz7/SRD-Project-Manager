-- Access for technical and non-technical staff (Oct 2026).
--
--   * users.technical: technical staff see engines, condition reports,
--     assets and plants (the Electricity / Water / Sewerage sections).
--     Non-technical staff don't. Administrators always see everything.
--     Existing users keep full access.
--   * Work is visible to everyone; technical staff run it. Whoever can run
--     a work item may let specific other people comment on it (work_commenters).
--   * Projects are shared per project: everyone, or chosen people who can
--     view or edit (project_members). The creator manages the list.

alter table users add column technical boolean not null default true;

alter table projects add column visibility text not null default 'members'
  check (visibility in ('everyone', 'members'));
update projects set visibility = 'everyone';   -- existing projects stay visible to all

create table project_members (
  project_id bigint not null references projects(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  access     text not null check (access in ('view', 'edit')),
  added_by   uuid references users(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members (user_id);
create trigger audit after insert or update or delete on project_members for each row execute function audit_row('project_id');

-- Creators and owners of existing projects can edit them.
insert into project_members (project_id, user_id, access, added_by)
select id, created_by, 'edit', created_by from projects where created_by is not null
on conflict do nothing;
insert into project_members (project_id, user_id, access, added_by)
select id, owner_id, 'edit', created_by from projects where owner_id is not null
on conflict do nothing;

create table work_commenters (
  work_id  bigint not null references work_orders(id) on delete cascade,
  user_id  uuid not null references users(id) on delete cascade,
  added_by uuid references users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (work_id, user_id)
);
create index work_commenters_user_idx on work_commenters (user_id);
create trigger audit after insert or update or delete on work_commenters for each row execute function audit_row('work_id');

-- Which Telegram chats get technical alerts (genset down / back up, and the
-- engine lines of the daily summary).
alter table telegram_chats add column technical boolean not null default true;
