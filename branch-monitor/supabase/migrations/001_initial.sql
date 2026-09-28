-- SRD Powerhouse Monitor v3
-- Supabase/Postgres schema for HOD, Unit Heads, acting delegation, projects,
-- powerhouse work, calculated progress, blockers and realtime updates.

create extension if not exists pgcrypto;

create type public.app_role as enum ('hod','unit_head','staff','viewer');
create type public.project_status as enum ('planned','active','on_hold','completed','archived');
create type public.priority_level as enum ('low','medium','high','critical');
create type public.work_status as enum ('new','planned','in_progress','waiting_blocked','completed','verified','closed');
create type public.task_status as enum ('planned','in_progress','waiting_blocked','completed');
create type public.work_type as enum (
  'project_work','repair_breakdown','preventive_maintenance','corrective_maintenance',
  'upgrade_modification','inspection','logistics_procurement','general_maintenance',
  'administrative','other'
);
create type public.blocker_category as enum (
  'awaiting_parts','awaiting_procurement','awaiting_transport','awaiting_contractor',
  'awaiting_approval','technical_issue','staff_unavailable','other'
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text unique not null,
  sort_order integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  staff_no text,
  designation text,
  role public.app_role not null default 'staff',
  primary_unit_id uuid references public.units(id),
  approved boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.unit_head_delegations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.units(id) on delete cascade,
  acting_head_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  note text,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint delegation_time_valid check (ends_at > starts_at)
);

create table public.atolls (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.islands (
  id uuid primary key default gen_random_uuid(),
  atoll_id uuid not null references public.atolls(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(atoll_id, name)
);

create table public.powerhouses (
  id uuid primary key default gen_random_uuid(),
  island_id uuid not null references public.islands(id) on delete cascade,
  name text not null,
  code text,
  operational_status text not null default 'operational',
  contact_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(island_id, name)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  title text not null,
  description text,
  status public.project_status not null default 'planned',
  priority public.priority_level not null default 'medium',
  lead_unit_id uuid not null references public.units(id),
  lead_user_id uuid references public.profiles(id),
  requested_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  powerhouse_id uuid references public.powerhouses(id),
  start_date date,
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_units (
  project_id uuid not null references public.projects(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  role text not null check (role in ('lead','support')),
  created_at timestamptz not null default now(),
  primary key(project_id, unit_id)
);

create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  powerhouse_id uuid not null references public.powerhouses(id),
  owning_unit_id uuid not null references public.units(id),
  supervisor_id uuid references public.profiles(id),
  requested_by uuid references public.profiles(id),
  created_by uuid not null references public.profiles(id),
  work_type public.work_type not null default 'project_work',
  title text not null,
  description text,
  status public.work_status not null default 'new',
  priority public.priority_level not null default 'medium',
  weight numeric(8,2) not null default 1 check (weight > 0),
  start_date date,
  due_date date,
  completed_at timestamptz,
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  assigned_unit_id uuid not null references public.units(id),
  title text not null,
  description text,
  status public.task_status not null default 'planned',
  weight numeric(8,2) not null default 1 check (weight > 0),
  due_date date,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.task_assignments (
  task_id uuid not null references public.tasks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id),
  assigned_at timestamptz not null default now(),
  primary key(task_id, profile_id)
);

create table public.task_checklist (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  weight numeric(8,2) not null default 1 check (weight > 0),
  sort_order integer not null default 0,
  completed boolean not null default false,
  completed_by uuid references public.profiles(id),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.work_updates (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  author_id uuid not null references public.profiles(id),
  update_type text not null default 'note',
  note text not null,
  created_at timestamptz not null default now()
);

create table public.blockers (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  category public.blocker_category not null default 'other',
  note text not null,
  status text not null default 'open' check (status in ('open','resolved')),
  escalated_to_hod boolean not null default false,
  raised_by uuid not null references public.profiles(id),
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id bigint generated by default as identity primary key,
  actor_id uuid references public.profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  summary text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('project','work_item','task','update')),
  entity_id uuid not null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index idx_profiles_unit on public.profiles(primary_unit_id) where approved and active;
create index idx_delegations_active on public.unit_head_delegations(unit_id, starts_at, ends_at);
create index idx_islands_atoll on public.islands(atoll_id);
create index idx_powerhouses_island on public.powerhouses(island_id);
create index idx_projects_status on public.projects(status, due_date);
create index idx_projects_lead_unit on public.projects(lead_unit_id);
create index idx_work_project on public.work_items(project_id);
create index idx_work_powerhouse on public.work_items(powerhouse_id);
create index idx_work_unit on public.work_items(owning_unit_id);
create index idx_work_status on public.work_items(status, priority, due_date);
create index idx_tasks_work on public.tasks(work_item_id);
create index idx_assignments_profile on public.task_assignments(profile_id);
create index idx_updates_work on public.work_updates(work_item_id, created_at desc);
create index idx_blockers_open on public.blockers(status, escalated_to_hod, created_at desc);
create index idx_activity_created on public.activity_log(created_at desc);

-- Helpers -------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger projects_touch before update on public.projects for each row execute function public.touch_updated_at();
create trigger work_items_touch before update on public.work_items for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks for each row execute function public.touch_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare first_user boolean;
begin
  select not exists(select 1 from public.profiles) into first_user;
  insert into public.profiles(id, full_name, role, approved)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(new.email,'@',1), 'New user'),
    case when first_user then 'hod'::public.app_role else 'staff'::public.app_role end,
    first_user
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select approved and active from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.is_hod()
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select approved and active and role='hod' from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.is_unit_head_for(target_unit uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(
    exists(select 1 from public.profiles p where p.id=auth.uid() and p.approved and p.active and p.role='unit_head' and p.primary_unit_id=target_unit)
    or exists(select 1 from public.unit_head_delegations d join public.profiles p on p.id=d.acting_head_id
      where d.unit_id=target_unit and d.acting_head_id=auth.uid() and p.approved and p.active and now() between d.starts_at and d.ends_at),
    false)
$$;
create or replace function public.can_manage_unit(target_unit uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_hod() or public.is_unit_head_for(target_unit)
$$;
create or replace function public.can_manage_project(target_project uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_hod() or exists(select 1 from public.projects p where p.id=target_project and public.is_unit_head_for(p.lead_unit_id))
$$;
create or replace function public.can_manage_work(target_work uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_hod() or exists(
    select 1 from public.work_items w where w.id=target_work and (
      public.is_unit_head_for(w.owning_unit_id) or (w.project_id is not null and public.can_manage_project(w.project_id))
    )
  )
$$;
create or replace function public.is_assigned_task(target_task uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.task_assignments a where a.task_id=target_task and a.profile_id=auth.uid())
$$;
create or replace function public.is_assigned_to_work(target_work uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tasks t join public.task_assignments a on a.task_id=t.id where t.work_item_id=target_work and a.profile_id=auth.uid())
$$;

-- Calculated progress views --------------------------------------------------
create or replace view public.task_overview
with (security_invoker=true) as
select
  t.*,
  u.name as assigned_unit_name,
  case
    when coalesce(c.total_weight,0) > 0 then round(100.0 * coalesce(c.done_weight,0) / c.total_weight)::int
    when t.status='completed' then 100
    when t.status='in_progress' then 50
    when t.status='waiting_blocked' then 35
    else 0
  end as progress
from public.tasks t
join public.units u on u.id=t.assigned_unit_id
left join lateral (
  select sum(weight) total_weight, sum(weight) filter(where completed) done_weight
  from public.task_checklist x where x.task_id=t.id
) c on true;

create or replace view public.work_item_overview
with (security_invoker=true) as
select
  w.*,
  ou.name as owning_unit_name,
  p.code as project_code,
  p.title as project_title,
  ph.name as powerhouse_name,
  i.name as island_name,
  a.code as atoll_code,
  case
    when coalesce(t.total_weight,0) > 0 then round(coalesce(t.weighted_progress,0) / t.total_weight)::int
    when w.status in ('verified','closed','completed') then 100
    when w.status='in_progress' then 50
    when w.status='waiting_blocked' then 35
    else 0
  end as progress
from public.work_items w
join public.units ou on ou.id=w.owning_unit_id
left join public.projects p on p.id=w.project_id
join public.powerhouses ph on ph.id=w.powerhouse_id
join public.islands i on i.id=ph.island_id
join public.atolls a on a.id=i.atoll_id
left join lateral (
  select sum(tv.weight) total_weight, sum(tv.weight * tv.progress) weighted_progress
  from public.task_overview tv where tv.work_item_id=w.id
) t on true;

create or replace view public.project_overview
with (security_invoker=true) as
select
  p.*,
  lu.name as lead_unit_name,
  ph.name as powerhouse_name,
  i.name as island_name,
  a.code as atoll_code,
  case
    when coalesce(w.total_weight,0) > 0 then round(coalesce(w.weighted_progress,0) / w.total_weight)::int
    when p.status='completed' then 100
    when p.status='active' then 0
    else 0
  end as progress
from public.projects p
join public.units lu on lu.id=p.lead_unit_id
left join public.powerhouses ph on ph.id=p.powerhouse_id
left join public.islands i on i.id=ph.island_id
left join public.atolls a on a.id=i.atoll_id
left join lateral (
  select sum(wv.weight) total_weight, sum(wv.weight * wv.progress) weighted_progress
  from public.work_item_overview wv where wv.project_id=p.id
) w on true;

create or replace view public.active_unit_heads
with (security_invoker=true) as
select
  u.id as unit_id, u.name as unit_name, u.code as unit_code,
  p.id as primary_head_id, p.full_name as primary_head_name,
  d.acting_head_id, ap.full_name as acting_head_name, d.ends_at
from public.units u
left join public.profiles p on p.primary_unit_id=u.id and p.role='unit_head' and p.approved and p.active
left join lateral (
  select x.* from public.unit_head_delegations x
  where x.unit_id=u.id and now() between x.starts_at and x.ends_at
  order by x.starts_at desc limit 1
) d on true
left join public.profiles ap on ap.id=d.acting_head_id
where u.active;

-- RLS -----------------------------------------------------------------------
alter table public.units enable row level security;
alter table public.profiles enable row level security;
alter table public.unit_head_delegations enable row level security;
alter table public.atolls enable row level security;
alter table public.islands enable row level security;
alter table public.powerhouses enable row level security;
alter table public.projects enable row level security;
alter table public.project_units enable row level security;
alter table public.work_items enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_checklist enable row level security;
alter table public.work_updates enable row level security;
alter table public.blockers enable row level security;
alter table public.activity_log enable row level security;
alter table public.attachments enable row level security;

create policy units_read on public.units for select to authenticated using (public.is_approved());
create policy units_hod_write on public.units for all to authenticated using (public.is_hod()) with check (public.is_hod());

create policy profiles_own_or_approved_read on public.profiles for select to authenticated using (id=auth.uid() or public.is_approved());
create policy profiles_hod_update on public.profiles for update to authenticated using (public.is_hod()) with check (public.is_hod());

create policy delegations_read on public.unit_head_delegations for select to authenticated using (public.is_approved());
create policy delegations_hod_write on public.unit_head_delegations for all to authenticated using (public.is_hod()) with check (public.is_hod());

create policy atolls_read on public.atolls for select to authenticated using (public.is_approved());
create policy atolls_hod_write on public.atolls for all to authenticated using (public.is_hod()) with check (public.is_hod());
create policy islands_read on public.islands for select to authenticated using (public.is_approved());
create policy islands_hod_write on public.islands for all to authenticated using (public.is_hod()) with check (public.is_hod());
create policy powerhouses_read on public.powerhouses for select to authenticated using (public.is_approved());
create policy powerhouses_hod_write on public.powerhouses for all to authenticated using (public.is_hod()) with check (public.is_hod());

create policy projects_read on public.projects for select to authenticated using (public.is_approved());
create policy projects_insert on public.projects for insert to authenticated with check (public.is_approved() and (public.is_hod() or public.is_unit_head_for(lead_unit_id)) and created_by=auth.uid());
create policy projects_update on public.projects for update to authenticated using (public.can_manage_project(id)) with check (public.can_manage_project(id));
create policy projects_delete on public.projects for delete to authenticated using (public.is_hod());

create policy project_units_read on public.project_units for select to authenticated using (public.is_approved());
create policy project_units_write on public.project_units for all to authenticated using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));

create policy work_read on public.work_items for select to authenticated using (public.is_approved());
create policy work_insert on public.work_items for insert to authenticated with check (
  public.is_approved() and created_by=auth.uid() and (
    public.can_manage_unit(owning_unit_id) or (project_id is not null and public.can_manage_project(project_id))
  )
);
create policy work_update on public.work_items for update to authenticated using (public.can_manage_work(id)) with check (public.can_manage_work(id));
create policy work_delete on public.work_items for delete to authenticated using (public.is_hod());

create policy tasks_read on public.tasks for select to authenticated using (public.is_approved());
create policy tasks_insert on public.tasks for insert to authenticated with check (public.can_manage_work(work_item_id) or public.can_manage_unit(assigned_unit_id));
create policy tasks_update on public.tasks for update to authenticated using (public.can_manage_work(work_item_id) or public.is_assigned_task(id)) with check (public.can_manage_work(work_item_id) or public.is_assigned_task(id));
create policy tasks_delete on public.tasks for delete to authenticated using (public.can_manage_work(work_item_id));

create policy assignments_read on public.task_assignments for select to authenticated using (public.is_approved());
create policy assignments_write on public.task_assignments for all to authenticated using (public.can_manage_work((select work_item_id from public.tasks where id=task_id))) with check (public.can_manage_work((select work_item_id from public.tasks where id=task_id)));

create policy checklist_read on public.task_checklist for select to authenticated using (public.is_approved());
create policy checklist_insert on public.task_checklist for insert to authenticated with check (public.can_manage_work((select work_item_id from public.tasks where id=task_id)));
create policy checklist_update on public.task_checklist for update to authenticated using (public.can_manage_work((select work_item_id from public.tasks where id=task_id)) or public.is_assigned_task(task_id)) with check (public.can_manage_work((select work_item_id from public.tasks where id=task_id)) or public.is_assigned_task(task_id));
create policy checklist_delete on public.task_checklist for delete to authenticated using (public.can_manage_work((select work_item_id from public.tasks where id=task_id)));

create policy updates_read on public.work_updates for select to authenticated using (public.is_approved());
create policy updates_insert on public.work_updates for insert to authenticated with check (author_id=auth.uid() and (public.can_manage_work(work_item_id) or public.is_assigned_to_work(work_item_id)));
create policy updates_hod_delete on public.work_updates for delete to authenticated using (public.is_hod());

create policy blockers_read on public.blockers for select to authenticated using (public.is_approved());
create policy blockers_insert on public.blockers for insert to authenticated with check (raised_by=auth.uid() and (public.can_manage_work(work_item_id) or public.is_assigned_to_work(work_item_id)));
create policy blockers_update on public.blockers for update to authenticated using (public.can_manage_work(work_item_id) or raised_by=auth.uid()) with check (public.can_manage_work(work_item_id) or raised_by=auth.uid());

create policy activity_read on public.activity_log for select to authenticated using (public.is_approved());
create policy activity_insert on public.activity_log for insert to authenticated with check (actor_id=auth.uid() and public.is_approved());

create policy attachments_read on public.attachments for select to authenticated using (public.is_approved());
create policy attachments_insert on public.attachments for insert to authenticated with check (uploaded_by=auth.uid() and public.is_approved());
create policy attachments_delete on public.attachments for delete to authenticated using (public.is_hod() or uploaded_by=auth.uid());

-- Seed department structure --------------------------------------------------
insert into public.units(code,name,sort_order) values
  ('ADMIN','Admin',10),
  ('MECH','Mechanical',20),
  ('ELEC','Electrical',30),
  ('LOG','Logistics',40),
  ('GM','General Maintenance',50)
on conflict(code) do nothing;

insert into public.atolls(code,name) values
  ('K','Kaafu'),
  ('ADh','Alif Dhaalu'),
  ('V','Vaavu'),
  ('M','Meemu')
on conflict(code) do nothing;

-- File bucket; attachments remain private and are served with signed URLs later.
insert into storage.buckets(id,name,public) values ('srd-files','srd-files',false)
on conflict(id) do nothing;

create policy srd_files_read on storage.objects for select to authenticated using (bucket_id='srd-files' and public.is_approved());
create policy srd_files_insert on storage.objects for insert to authenticated with check (bucket_id='srd-files' and public.is_approved());
create policy srd_files_delete on storage.objects for delete to authenticated using (bucket_id='srd-files' and public.is_approved());

-- Realtime tables ------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.projects;
  alter publication supabase_realtime add table public.work_items;
  alter publication supabase_realtime add table public.tasks;
  alter publication supabase_realtime add table public.task_checklist;
  alter publication supabase_realtime add table public.work_updates;
  alter publication supabase_realtime add table public.blockers;
  alter publication supabase_realtime add table public.unit_head_delegations;
exception when duplicate_object then null;
end $$;
