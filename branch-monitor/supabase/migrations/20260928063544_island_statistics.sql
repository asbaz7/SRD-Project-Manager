create table public.island_statistics (
  id text primary key,
  statistics jsonb not null check (jsonb_typeof(statistics) = 'object' and statistics ? 'id' and statistics->>'id' = id),
  updated_at timestamptz not null default now()
);
alter table public.island_statistics enable row level security;
revoke all on public.island_statistics from anon, public;
grant select, insert, update, delete on public.island_statistics to authenticated;
grant all on public.island_statistics to service_role;
create policy island_statistics_read on public.island_statistics for select to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved and p.active));
create policy island_statistics_hod_write on public.island_statistics for all to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved and p.active and p.role = 'hod'))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.approved and p.active and p.role = 'hod'));
create trigger island_statistics_touch before update on public.island_statistics for each row execute function public.touch_updated_at();
