create table if not exists public.engine_condition_reports (
  id uuid primary key default gen_random_uuid(),
  powerhouse_id uuid not null references public.powerhouses(id) on delete cascade,
  report_month date not null,
  maximum_peak_kw numeric,
  maximum_peak_date date,
  maximum_peak_time time,
  monthly_peak_kw numeric,
  monthly_peak_date date,
  monthly_peak_time time,
  record_updated_date date,
  report_status text not null default 'submitted' check (report_status in ('draft','submitted')),
  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(powerhouse_id, report_month)
);

create table if not exists public.engine_condition_entries (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.engine_condition_reports(id) on delete cascade,
  genset_id uuid not null references public.gensets(id) on delete cascade,
  genset_number text not null,
  fixed_asset_code text,
  engine_make text,
  engine_model text,
  engine_capacity_kw numeric,
  engine_serial_no text,
  cpl_spec_no text,
  dynamo_make text,
  dynamo_frame_no text,
  dynamo_serial_no text,
  dynamo_capacity_kw numeric,
  last_battery_change_date date,
  last_dynamo_service_date date,
  original_commissioning_date date,
  engine_installed_date date,
  connected_to_panel boolean,
  engine_status text,
  fault_details text,
  last_valve_clearance_date date,
  running_hours_since_valve_clearance text,
  last_overhaul_date date,
  running_hours_since_overhaul text,
  total_running_hours text,
  max_load_month_kw numeric,
  max_load_capacity_kw numeric,
  engine_needs_overhaul boolean,
  dynamo_needs_service boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_id, genset_id)
);

create index if not exists idx_engine_condition_reports_powerhouse_month
  on public.engine_condition_reports(powerhouse_id, report_month desc);
create index if not exists idx_engine_condition_entries_report
  on public.engine_condition_entries(report_id, genset_number);

create or replace function private.can_manage_engine_reports()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select approved and active and role in ('developer','hod','unit_head')
    from public.profiles
    where id = (select auth.uid())
  ), false)
$$;

alter table public.engine_condition_reports enable row level security;
alter table public.engine_condition_entries enable row level security;

create policy engine_condition_reports_read
on public.engine_condition_reports for select to authenticated
using (private.is_approved());

create policy engine_condition_reports_write
on public.engine_condition_reports for all to authenticated
using (private.can_manage_engine_reports())
with check (private.can_manage_engine_reports());

create policy engine_condition_entries_read
on public.engine_condition_entries for select to authenticated
using (private.is_approved());

create policy engine_condition_entries_write
on public.engine_condition_entries for all to authenticated
using (private.can_manage_engine_reports())
with check (private.can_manage_engine_reports());
