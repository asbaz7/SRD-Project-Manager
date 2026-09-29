-- SRD Utility Manager — core schema
-- Electricity, water and sewerage operations across atolls and islands.
--
-- Layout
--   Location   atolls → islands
--   Assets     facilities (powerhouse, water plant, sewerage plant, ...) → assets (genset, RO unit, pump, ...)
--   Operations readings (daily log), asset_status_log, incidents, projects, project_updates
--   Access     users, user_scopes, sessions
--   Trace      audit_log (written by triggers; the acting user comes from app.user_id)

create type service_type   as enum ('electricity', 'water', 'sewerage');
create type user_role      as enum ('admin', 'manager', 'operator', 'viewer');
create type asset_status   as enum ('running', 'standby', 'down', 'maintenance', 'decommissioned', 'unknown');
create type incident_state as enum ('open', 'resolved', 'closed');
create type severity_level as enum ('low', 'medium', 'high', 'critical');
create type project_state  as enum ('planned', 'ongoing', 'on_hold', 'completed', 'cancelled');

-- Shared trigger: keep updated_at current.
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  full_name     text not null,
  designation   text,
  phone         text,
  password_hash text not null,
  role          user_role not null default 'viewer',
  active        boolean not null default true,
  must_change_password boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index users_email_key on users (lower(email));
create trigger users_touch before update on users for each row execute function touch_updated_at();

-- Opaque session tokens; only the SHA-256 hash is stored.
create table sessions (
  token_hash   bytea primary key,
  user_id      uuid not null references users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip           text,
  user_agent   text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Location
-- ---------------------------------------------------------------------------
create table atolls (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger atolls_touch before update on atolls for each row execute function touch_updated_at();

create table islands (
  id         uuid primary key default gen_random_uuid(),
  atoll_id   uuid not null references atolls(id),
  name       text not null,
  population integer check (population is null or population >= 0),
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (atoll_id, name)
);
create trigger islands_touch before update on islands for each row execute function touch_updated_at();

-- Where a user may write. A row grants one island, one whole atoll, or
-- (both null) the whole region. Admins can write everywhere without a row.
-- Everyone signed in can read everything.
create table user_scopes (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references users(id) on delete cascade,
  atoll_id  uuid references atolls(id) on delete cascade,
  island_id uuid references islands(id) on delete cascade,
  check (atoll_id is null or island_id is null)
);
create unique index user_scopes_unique
  on user_scopes (user_id, coalesce(atoll_id, island_id, '00000000-0000-0000-0000-000000000000'));

-- ---------------------------------------------------------------------------
-- Facilities and assets
-- ---------------------------------------------------------------------------
create table facilities (
  id         uuid primary key default gen_random_uuid(),
  island_id  uuid not null references islands(id),
  service    service_type not null,
  kind       text not null check (kind in ('powerhouse', 'solar_plant', 'water_plant', 'water_storage', 'sewerage_plant', 'pump_station', 'other')),
  name       text not null,
  -- Storage capacities kept as columns: they drive reports and alerts.
  fuel_capacity_l   numeric check (fuel_capacity_l is null or fuel_capacity_l >= 0),
  water_capacity_m3 numeric check (water_capacity_m3 is null or water_capacity_m3 >= 0),
  commissioned_on date,
  notes      text,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (island_id, name)
);
create index facilities_island_idx on facilities (island_id);
create index facilities_service_idx on facilities (service);
create trigger facilities_touch before update on facilities for each row execute function touch_updated_at();

create table assets (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  kind        text not null check (kind in ('genset', 'solar_inverter', 'battery', 'transformer', 'ro_unit', 'pump', 'blower', 'tank', 'other')),
  tag         text not null,               -- e.g. genset number "3", "RO-2", "P-01"
  make_model  text,
  serial_no   text,
  rated_capacity     numeric check (rated_capacity is null or rated_capacity >= 0),
  operating_capacity numeric check (operating_capacity is null or operating_capacity >= 0),
  capacity_unit      text,                 -- kW, kVA, m3/day, m3/h, L, kWh
  commissioned_on date,
  running_hours   numeric check (running_hours is null or running_hours >= 0),
  -- Latest status, denormalised from asset_status_log for fast dashboards.
  status      asset_status not null default 'unknown',
  status_note text,
  status_at   timestamptz,
  status_by   uuid references users(id),
  notes       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (facility_id, kind, tag)
);
create index assets_facility_idx on assets (facility_id);
create index assets_status_idx on assets (status) where active;
create trigger assets_touch before update on assets for each row execute function touch_updated_at();

-- Every status change is kept; assets.status mirrors the latest entry.
create table asset_status_log (
  id          bigint generated always as identity primary key,
  asset_id    uuid not null references assets(id) on delete cascade,
  status      asset_status not null,
  note        text,
  running_hours numeric,
  reported_at timestamptz not null default now(),
  reported_by uuid references users(id)
);
create index asset_status_log_asset_idx on asset_status_log (asset_id, reported_at desc);

create function apply_asset_status() returns trigger language plpgsql as $$
begin
  update assets a
     set status = new.status,
         status_note = new.note,
         status_at = new.reported_at,
         status_by = new.reported_by,
         running_hours = coalesce(new.running_hours, a.running_hours)
   where a.id = new.asset_id
     and (a.status_at is null or a.status_at <= new.reported_at);
  return new;
end $$;
create trigger asset_status_log_apply after insert on asset_status_log
for each row execute function apply_asset_status();

-- ---------------------------------------------------------------------------
-- Daily operations log (replaces the daily/monthly Excel log sheets)
-- ---------------------------------------------------------------------------
-- Metric catalogue. New measurements are added as rows, not columns.
create table metrics (
  code        text primary key,
  service     service_type not null,
  name        text not null,
  unit        text not null,
  aggregation text not null default 'sum' check (aggregation in ('sum', 'max', 'min', 'avg', 'last')),
  sort_order  integer not null default 100,
  active      boolean not null default true
);

create table readings (
  facility_id  uuid not null references facilities(id),
  reading_date date not null,
  metric       text not null references metrics(code),
  value        numeric not null,
  note         text,
  entered_by   uuid references users(id),
  entered_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (facility_id, reading_date, metric)
);
create index readings_date_idx on readings (reading_date);
create index readings_metric_date_idx on readings (metric, reading_date);
create trigger readings_touch before update on readings for each row execute function touch_updated_at();

-- A reading's metric must belong to the facility's service.
create function check_reading_service() returns trigger language plpgsql as $$
declare
  f_service service_type;
  m_service service_type;
begin
  select service into f_service from facilities where id = new.facility_id;
  select service into m_service from metrics where code = new.metric;
  if f_service is distinct from m_service then
    raise exception 'metric % (%) does not apply to a % facility', new.metric, m_service, f_service
      using errcode = '23514';
  end if;
  return new;
end $$;
create trigger readings_service_check before insert or update of metric, facility_id on readings
for each row execute function check_reading_service();

-- ---------------------------------------------------------------------------
-- Incidents: outages, breakdowns, maintenance and quality issues
-- ---------------------------------------------------------------------------
create table incidents (
  id          bigint generated always as identity primary key,  -- shown as INC-000123
  service     service_type not null,
  island_id   uuid not null references islands(id),
  facility_id uuid references facilities(id),
  asset_id    uuid references assets(id),
  category    text not null check (category in ('outage', 'breakdown', 'maintenance', 'quality', 'safety', 'other')),
  severity    severity_level not null default 'medium',
  title       text not null,
  description text,
  started_at  timestamptz not null,
  resolved_at timestamptz check (resolved_at is null or resolved_at >= started_at),
  customers_affected integer check (customers_affected is null or customers_affected >= 0),
  status      incident_state not null default 'open',
  resolution  text,
  reported_by uuid references users(id),
  resolved_by uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index incidents_island_idx on incidents (island_id, started_at desc);
create index incidents_open_idx on incidents (status) where status = 'open';
create index incidents_started_idx on incidents (started_at desc);
create trigger incidents_touch before update on incidents for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------
create table projects (
  id          bigint generated always as identity primary key,  -- shown as PRJ-0042
  service     service_type not null,
  island_id   uuid references islands(id),                       -- null = regional project
  facility_id uuid references facilities(id),
  title       text not null,
  description text,
  status      project_state not null default 'planned',
  progress_pct smallint not null default 0 check (progress_pct between 0 and 100),
  budget      numeric check (budget is null or budget >= 0),
  contractor  text,
  start_date  date,
  target_date date,
  completed_on date,
  owner_id    uuid references users(id),
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index projects_island_idx on projects (island_id);
create index projects_status_idx on projects (status);
create trigger projects_touch before update on projects for each row execute function touch_updated_at();

create table project_updates (
  id           bigint generated always as identity primary key,
  project_id   bigint not null references projects(id) on delete cascade,
  body         text not null,
  progress_pct smallint check (progress_pct between 0 and 100),
  status       project_state,
  created_by   uuid references users(id),
  created_at   timestamptz not null default now()
);
create index project_updates_project_idx on project_updates (project_id, created_at desc);

-- A project update moves the project's progress / status forward.
create function apply_project_update() returns trigger language plpgsql as $$
begin
  update projects p
     set progress_pct = coalesce(new.progress_pct, p.progress_pct),
         status = coalesce(new.status, p.status),
         completed_on = case when coalesce(new.status, p.status) = 'completed'
                             then coalesce(p.completed_on, current_date) else p.completed_on end
   where p.id = new.project_id;
  return new;
end $$;
create trigger project_updates_apply after insert on project_updates
for each row execute function apply_project_update();

-- ---------------------------------------------------------------------------
-- Audit trail: who changed what, for every business table.
-- The API sets app.user_id inside each write transaction.
-- ---------------------------------------------------------------------------
create table audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  user_id   uuid,
  action    text not null check (action in ('insert', 'update', 'delete')),
  entity    text not null,
  entity_id text,
  changes   jsonb
);
create index audit_log_entity_idx on audit_log (entity, entity_id, at desc);
create index audit_log_at_idx on audit_log (at desc);
create index audit_log_user_idx on audit_log (user_id, at desc);

create function audit_row() returns trigger language plpgsql as $$
declare
  actor uuid := nullif(current_setting('app.user_id', true), '')::uuid;
  old_j jsonb;
  new_j jsonb;
  diff  jsonb;
  key_col text := coalesce(tg_argv[0], 'id');
begin
  if tg_op in ('UPDATE', 'DELETE') then old_j := to_jsonb(old) - 'password_hash' - 'updated_at'; end if;
  if tg_op in ('INSERT', 'UPDATE') then new_j := to_jsonb(new) - 'password_hash' - 'updated_at'; end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, jsonb_build_object('from', old_j -> k, 'to', new_j -> k))
      into diff
      from jsonb_object_keys(new_j) k
     where (old_j -> k) is distinct from (new_j -> k);
    if diff is null then return new; end if;   -- nothing changed
  elsif tg_op = 'INSERT' then
    diff := new_j;
  else
    diff := old_j;
  end if;

  insert into audit_log (user_id, action, entity, entity_id, changes)
  values (actor, lower(tg_op), tg_table_name,
          case when key_col = '*' then null else coalesce(new_j, old_j) ->> key_col end,
          diff);
  return coalesce(new, old);
end $$;

create trigger audit after insert or update or delete on users            for each row execute function audit_row();
create trigger audit after insert or update or delete on user_scopes      for each row execute function audit_row();
create trigger audit after insert or update or delete on atolls           for each row execute function audit_row();
create trigger audit after insert or update or delete on islands          for each row execute function audit_row();
create trigger audit after insert or update or delete on facilities       for each row execute function audit_row();
create trigger audit after insert or update or delete on assets           for each row execute function audit_row();
create trigger audit after insert or update or delete on readings         for each row execute function audit_row('facility_id');
create trigger audit after insert or update or delete on incidents        for each row execute function audit_row();
create trigger audit after insert or update or delete on projects         for each row execute function audit_row();
create trigger audit after insert or update or delete on project_updates  for each row execute function audit_row();
create trigger audit after insert or update or delete on metrics          for each row execute function audit_row('code');
