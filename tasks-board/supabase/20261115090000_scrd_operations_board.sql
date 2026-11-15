-- SCRD Operations Board (tasks.islandsmanager.org)
-- Tables for the department TV board: tasks, power interruptions, daily
-- attendance and the island list the board's map uses.
-- Everyone can read (the TV shows it without a login); only signed-in
-- users whose email is listed in scrd_board_editors can add, change or
-- delete records.

create table if not exists public.scrd_board_editors (
  email text primary key check (email = lower(email)),
  name text,
  added_at timestamptz not null default now()
);

create table if not exists public.scrd_board_islands (
  island text primary key,             -- as written on tasks, e.g. 'M. Mulah'
  atoll text not null check (atoll in ('AA','ADh','V','M','F','Dh','Th')),
  atoll_name text not null,
  lat double precision not null,
  lon double precision not null
);

create table if not exists public.scrd_board_tasks (
  id text primary key,                 -- SCRD-001, SCRD-002, ...
  task text not null check (length(task) between 1 and 200),
  island text not null,                -- an island above, or 'SCRD office', 'SCRD workshop', 'K. Huraa', ...
  unit text not null check (unit in ('Electrical Services Unit','Mechanical Services Unit','Water and Sewage Services Unit','Administration and Support Service Unit','Logistics Unit')),
  category text not null default 'Mechanical',
  status text not null default 'Planned' check (status in ('Planned','In progress','On hold','Completed')),
  progress smallint not null default 0 check (progress between 0 and 100),
  start_date date,
  due_date date,
  assigned text not null default '',
  note text not null default '',
  source text,
  sample boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create table if not exists public.scrd_board_outages (
  id text primary key,                 -- INT-001, INT-002, ...
  island text not null,
  service text not null default 'Electricity',
  type text not null default 'Unplanned' check (type in ('Planned','Unplanned')),
  start_at timestamptz not null,
  end_at timestamptz,                  -- empty while the island is still without power
  cause text not null default '',
  unit text not null default 'Mechanical Services Unit',
  sample boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  check (end_at is null or end_at >= start_at)
);

create table if not exists public.scrd_board_attendance (
  id text primary key,                 -- the day, YYYY-MM-DD
  date date not null unique,
  rows jsonb not null default '[]'::jsonb,   -- [{staff_id, name, unit, role, status, until, note}]
  sample boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);

create index if not exists scrd_board_tasks_status_idx on public.scrd_board_tasks (status);
create index if not exists scrd_board_outages_start_idx on public.scrd_board_outages (start_at desc);

-- Stamp who changed a row and when
create or replace function public.scrd_board_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists scrd_board_tasks_touch on public.scrd_board_tasks;
create trigger scrd_board_tasks_touch before insert or update on public.scrd_board_tasks
for each row execute function public.scrd_board_touch();
drop trigger if exists scrd_board_outages_touch on public.scrd_board_outages;
create trigger scrd_board_outages_touch before insert or update on public.scrd_board_outages
for each row execute function public.scrd_board_touch();
drop trigger if exists scrd_board_attendance_touch on public.scrd_board_attendance;
create trigger scrd_board_attendance_touch before insert or update on public.scrd_board_attendance
for each row execute function public.scrd_board_touch();

-- Is the signed-in user allowed to edit the board?
create or replace function public.is_scrd_board_editor()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.scrd_board_editors e
    where e.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
$$;
revoke all on function public.is_scrd_board_editor() from public;
grant execute on function public.is_scrd_board_editor() to authenticated;

-- Row level security
alter table public.scrd_board_editors enable row level security;
alter table public.scrd_board_islands enable row level security;
alter table public.scrd_board_tasks enable row level security;
alter table public.scrd_board_outages enable row level security;
alter table public.scrd_board_attendance enable row level security;

-- editors list: nobody reads or writes it through the API (manage it in the Supabase dashboard)

drop policy if exists scrd_board_islands_read on public.scrd_board_islands;
create policy scrd_board_islands_read on public.scrd_board_islands for select to anon, authenticated using (true);
drop policy if exists scrd_board_islands_write on public.scrd_board_islands;
create policy scrd_board_islands_write on public.scrd_board_islands for all to authenticated
  using ((select public.is_scrd_board_editor())) with check ((select public.is_scrd_board_editor()));

drop policy if exists scrd_board_tasks_read on public.scrd_board_tasks;
create policy scrd_board_tasks_read on public.scrd_board_tasks for select to anon, authenticated using (true);
drop policy if exists scrd_board_tasks_write on public.scrd_board_tasks;
create policy scrd_board_tasks_write on public.scrd_board_tasks for all to authenticated
  using ((select public.is_scrd_board_editor())) with check ((select public.is_scrd_board_editor()));

drop policy if exists scrd_board_outages_read on public.scrd_board_outages;
create policy scrd_board_outages_read on public.scrd_board_outages for select to anon, authenticated using (true);
drop policy if exists scrd_board_outages_write on public.scrd_board_outages;
create policy scrd_board_outages_write on public.scrd_board_outages for all to authenticated
  using ((select public.is_scrd_board_editor())) with check ((select public.is_scrd_board_editor()));

drop policy if exists scrd_board_attendance_read on public.scrd_board_attendance;
create policy scrd_board_attendance_read on public.scrd_board_attendance for select to anon, authenticated using (true);
drop policy if exists scrd_board_attendance_write on public.scrd_board_attendance;
create policy scrd_board_attendance_write on public.scrd_board_attendance for all to authenticated
  using ((select public.is_scrd_board_editor())) with check ((select public.is_scrd_board_editor()));

grant select on public.scrd_board_islands, public.scrd_board_tasks, public.scrd_board_outages, public.scrd_board_attendance to anon, authenticated;
grant insert, update, delete on public.scrd_board_islands, public.scrd_board_tasks, public.scrd_board_outages, public.scrd_board_attendance to authenticated;
revoke all on public.scrd_board_editors from anon, authenticated;

-- Live updates on the TV
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.scrd_board_tasks; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.scrd_board_outages; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.scrd_board_attendance; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.scrd_board_islands; exception when duplicate_object then null; end;
  end if;
end $$;

-- The board's island list (positions approximate; check against SCRD's own list)
insert into public.scrd_board_islands (island, atoll, atoll_name, lat, lon) values
  ('AA. Thoddoo', 'AA', 'Alif Alif', 4.437, 72.958),
  ('AA. Rasdhoo', 'AA', 'Alif Alif', 4.263, 72.991),
  ('AA. Ukulhas', 'AA', 'Alif Alif', 4.215, 72.863),
  ('AA. Mathiveri', 'AA', 'Alif Alif', 4.192, 72.745),
  ('AA. Bodufolhudhoo', 'AA', 'Alif Alif', 4.186, 72.776),
  ('AA. Feridhoo', 'AA', 'Alif Alif', 4.05, 72.723),
  ('AA. Maalhos', 'AA', 'Alif Alif', 3.988, 72.721),
  ('AA. Himandhoo', 'AA', 'Alif Alif', 3.922, 72.745),
  ('ADh. Hangnaameedhoo', 'ADh', 'Alif Dhaal', 3.848, 72.954),
  ('ADh. Omadhoo', 'ADh', 'Alif Dhaal', 3.79, 72.966),
  ('ADh. Kunburudhoo', 'ADh', 'Alif Dhaal', 3.806, 72.912),
  ('ADh. Mahibadhoo', 'ADh', 'Alif Dhaal', 3.757, 72.969),
  ('ADh. Mandhoo', 'ADh', 'Alif Dhaal', 3.697, 72.712),
  ('ADh. Dhangethi', 'ADh', 'Alif Dhaal', 3.608, 72.955),
  ('ADh. Dhigurah', 'ADh', 'Alif Dhaal', 3.531, 72.927),
  ('ADh. Fenfushi', 'ADh', 'Alif Dhaal', 3.49, 72.783),
  ('ADh. Dhidhdhoo', 'ADh', 'Alif Dhaal', 3.4836, 72.8778),
  ('V. Fulidhoo', 'V', 'Vaavu', 3.68, 73.414),
  ('V. Thinadhoo', 'V', 'Vaavu', 3.488, 73.538),
  ('V. Felidhoo', 'V', 'Vaavu', 3.472, 73.547),
  ('V. Keyodhoo', 'V', 'Vaavu', 3.456, 73.555),
  ('V. Rakeedhoo', 'V', 'Vaavu', 3.316, 73.468),
  ('M. Dhiggaru', 'M', 'Meemu', 3.115, 73.563),
  ('M. Maduvvari', 'M', 'Meemu', 3.098, 73.583),
  ('M. Raiymandhoo', 'M', 'Meemu', 3.087, 73.643),
  ('M. Veyvah', 'M', 'Meemu', 2.968, 73.596),
  ('M. Mulah', 'M', 'Meemu', 2.947, 73.59),
  ('M. Muli', 'M', 'Meemu', 2.922, 73.581),
  ('M. Naalaafushi', 'M', 'Meemu', 2.896, 73.572),
  ('M. Kolhufushi', 'M', 'Meemu', 2.78, 73.418),
  ('F. Feeali', 'F', 'Faafu', 3.27, 73.0),
  ('F. Bileddhoo', 'F', 'Faafu', 3.118, 72.985),
  ('F. Magoodhoo', 'F', 'Faafu', 3.078, 72.957),
  ('F. Dharanboodhoo', 'F', 'Faafu', 3.063, 72.925),
  ('F. Nilandhoo', 'F', 'Faafu', 3.057, 72.89),
  ('Dh. Meedhoo', 'Dh', 'Dhaalu', 2.985, 72.952),
  ('Dh. Rinbudhoo', 'Dh', 'Dhaalu', 2.937, 72.893),
  ('Dh. Hulhudheli', 'Dh', 'Dhaalu', 2.862, 72.852),
  ('Dh. Bandidhoo', 'Dh', 'Dhaalu', 2.81, 73.02),
  ('Dh. Maaenboodhoo', 'Dh', 'Dhaalu', 2.698, 72.958),
  ('Dh. Kudahuvadhoo', 'Dh', 'Dhaalu', 2.671, 72.894),
  ('Th. Buruni', 'Th', 'Thaa', 2.556, 73.102),
  ('Th. Vilufushi', 'Th', 'Thaa', 2.503, 73.309),
  ('Th. Madifushi', 'Th', 'Thaa', 2.356, 73.355),
  ('Th. Guraidhoo', 'Th', 'Thaa', 2.325, 73.318),
  ('Th. Kandoodhoo', 'Th', 'Thaa', 2.322, 72.924),
  ('Th. Dhiyamigili', 'Th', 'Thaa', 2.338, 72.958),
  ('Th. Vandhoo', 'Th', 'Thaa', 2.254, 72.938),
  ('Th. Hirilandhoo', 'Th', 'Thaa', 2.276, 72.928),
  ('Th. Gaadhiffushi', 'Th', 'Thaa', 2.254, 73.213),
  ('Th. Thimarafushi', 'Th', 'Thaa', 2.21, 73.149),
  ('Th. Veymandoo', 'Th', 'Thaa', 2.188, 73.096),
  ('Th. Kinbidhoo', 'Th', 'Thaa', 2.175, 73.055),
  ('Th. Omadhoo', 'Th', 'Thaa', 2.166, 73.01)
on conflict (island) do nothing;
