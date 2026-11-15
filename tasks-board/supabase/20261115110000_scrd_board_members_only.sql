-- Applied 2026-11-15 to SRD Utility Manager (nupbpsowqhhkjvsdbstj).
-- SCRD board: viewing needs a sign-in too.
-- One list of approved people. Everyone on it can view; those with can_edit
-- can also add, change and delete. The account's email must be confirmed.

create table if not exists public.scrd_board_members (
  email text primary key check (email = lower(email)),
  name text,
  can_edit boolean not null default false,
  added_at timestamptz not null default now()
);
alter table public.scrd_board_members enable row level security;
revoke all on public.scrd_board_members from anon, authenticated;

do $$
begin
  if to_regclass('public.scrd_board_editors') is not null then
    insert into public.scrd_board_members (email, name, can_edit, added_at)
    select email, name, true, added_at from public.scrd_board_editors
    on conflict (email) do update set can_edit = true;
  end if;
end $$;

create or replace function public.is_scrd_board_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.scrd_board_members m on m.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  )
$$;

create or replace function public.is_scrd_board_editor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join public.scrd_board_members m on m.email = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null and m.can_edit
  )
$$;

revoke all on function public.is_scrd_board_member() from public, anon;
revoke all on function public.is_scrd_board_editor() from public, anon;
grant execute on function public.is_scrd_board_member() to authenticated;
grant execute on function public.is_scrd_board_editor() to authenticated;

-- reading: approved, signed-in people only
drop policy if exists scrd_board_islands_read on public.scrd_board_islands;
create policy scrd_board_islands_read on public.scrd_board_islands for select to authenticated using ((select public.is_scrd_board_member()));
drop policy if exists scrd_board_tasks_read on public.scrd_board_tasks;
create policy scrd_board_tasks_read on public.scrd_board_tasks for select to authenticated using ((select public.is_scrd_board_member()));
drop policy if exists scrd_board_outages_read on public.scrd_board_outages;
create policy scrd_board_outages_read on public.scrd_board_outages for select to authenticated using ((select public.is_scrd_board_member()));
drop policy if exists scrd_board_attendance_read on public.scrd_board_attendance;
create policy scrd_board_attendance_read on public.scrd_board_attendance for select to authenticated using ((select public.is_scrd_board_member()));

revoke all on public.scrd_board_islands, public.scrd_board_tasks, public.scrd_board_outages, public.scrd_board_attendance from anon;

drop table if exists public.scrd_board_editors;
