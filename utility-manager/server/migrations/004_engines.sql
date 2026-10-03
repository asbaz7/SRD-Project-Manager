-- Engine condition, maintenance history and ongoing work.
--
-- Monthly ENGINE CONDITION REPORT workbooks are uploaded as they are. Each
-- upload keeps only the LATEST condition per genset (engine_conditions) and
-- per powerhouse (powerhouse_reports); the files themselves are not stored.
-- Every dated event found in a report (overhaul, alternator service, valve
-- clearance, battery change) is kept permanently in maintenance_events, so
-- the history builds itself from the monthly uploads.

-- Register details the reports carry --------------------------------------
alter table assets
  add column fixed_asset_code text,
  add column cpl_spec text,
  add column alt_make text,
  add column alt_frame text,
  add column alt_serial text,
  add column alt_kw numeric check (alt_kw is null or alt_kw >= 0),
  add column connected_to_panel boolean,
  -- Filled from the overhaul / alternator service schedules (or by hand).
  add column next_overhaul_hours numeric check (next_overhaul_hours is null or next_overhaul_hours >= 0),
  add column next_overhaul_on date,
  add column next_alt_service_on date;

-- Latest condition of each engine -----------------------------------------
create table engine_conditions (
  asset_id      uuid primary key references assets(id) on delete cascade,
  report_month  date not null,               -- first day of the month reported on
  reported_on   date,                        -- 'THIS RECORD UPDATED DATE'
  status_text   text,                        -- e.g. 'RUNNING; MINOR FAULT'
  condition     text check (condition in ('ok', 'minor_fault', 'major_fault', 'not_running')),
  fault         text,
  total_hours   numeric,
  hours_since_overhaul numeric,
  last_overhaul_on date,
  hours_since_valve numeric,
  last_valve_on date,
  last_alt_service_on date,
  last_battery_on date,
  max_load_kw   numeric,
  capable_kw    numeric,
  needs_overhaul boolean,
  alt_needs_service boolean,
  overhaul_spares_received boolean,
  uploaded_by   uuid references users(id),
  updated_at    timestamptz not null default now()
);
create index engine_conditions_condition_idx on engine_conditions (condition);

-- Total running hours per month: a few numbers per engine, used for trends
-- and to project when the next overhaul falls due.
create table hours_log (
  asset_id    uuid not null references assets(id) on delete cascade,
  month       date not null,
  total_hours numeric not null,
  primary key (asset_id, month)
);

-- Latest report received from each powerhouse.
create table powerhouse_reports (
  facility_id      uuid primary key references facilities(id) on delete cascade,
  report_month     date not null,
  reported_on      date,
  peak_load_record text,
  peak_load_month  text,
  genset_count     integer,
  file_name        text,
  uploaded_by      uuid references users(id),
  uploaded_at      timestamptz not null default now()
);

-- Ongoing work on a genset, facility or island --------------------------
create table work_orders (
  id          bigint generated always as identity primary key,   -- shown as WO-0042
  island_id   uuid not null references islands(id),
  facility_id uuid references facilities(id),
  asset_id    uuid references assets(id),
  kind        text not null check (kind in ('overhaul', 'top_overhaul', 'alternator_service', 'repair', 'service',
                                            'inspection', 'installation', 'other')),
  title       text not null,
  description text,
  status      text not null default 'in_progress'
              check (status in ('planned', 'in_progress', 'awaiting_parts', 'on_hold', 'completed', 'cancelled')),
  assigned_to text,                                   -- team or contractor
  started_on  date,
  target_on   date,
  completed_on date,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index work_orders_open_idx on work_orders (status) where status not in ('completed', 'cancelled');
create index work_orders_asset_idx on work_orders (asset_id);
create index work_orders_island_idx on work_orders (island_id);
create trigger work_orders_touch before update on work_orders for each row execute function touch_updated_at();

create table work_updates (
  id         bigint generated always as identity primary key,
  work_id    bigint not null references work_orders(id) on delete cascade,
  body       text not null,
  status     text check (status in ('planned', 'in_progress', 'awaiting_parts', 'on_hold', 'completed', 'cancelled')),
  created_by uuid references users(id),
  created_at timestamptz not null default now()
);
create index work_updates_work_idx on work_updates (work_id, created_at desc);

-- Maintenance history (kept for good) -------------------------------------
create table maintenance_events (
  id            bigint generated always as identity primary key,
  asset_id      uuid not null references assets(id) on delete cascade,
  kind          text not null check (kind in ('overhaul', 'top_overhaul', 'alternator_service', 'valve_clearance',
                                              'battery_change', 'repair', 'service', 'inspection', 'other')),
  done_on       date not null,
  running_hours numeric,
  notes         text,
  source        text not null default 'manual' check (source in ('report', 'work', 'manual')),
  work_id       bigint references work_orders(id) on delete set null,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  unique (asset_id, kind, done_on)
);
create index maintenance_events_asset_idx on maintenance_events (asset_id, done_on desc);

-- A work update can move the work's status; completing it stamps the date.
create function apply_work_update() returns trigger language plpgsql as $$
begin
  if new.status is not null then
    update work_orders w
       set status = new.status,
           completed_on = case when new.status = 'completed' then coalesce(w.completed_on, current_date)
                               when new.status = 'cancelled' then w.completed_on
                               else null end
     where w.id = new.work_id;
  end if;
  return new;
end $$;
create trigger work_updates_apply after insert on work_updates for each row execute function apply_work_update();

-- Completed work on an engine goes into its maintenance history.
create function log_completed_work() returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and new.asset_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    insert into maintenance_events (asset_id, kind, done_on, running_hours, notes, source, work_id, created_by)
    values (new.asset_id,
            case when new.kind = 'installation' then 'other' else new.kind end,
            coalesce(new.completed_on, current_date),
            (select total_hours from engine_conditions where asset_id = new.asset_id),
            new.title || coalesce(': ' || new.description, ''),
            'work', new.id, nullif(current_setting('app.user_id', true), '')::uuid)
    on conflict (asset_id, kind, done_on) do update
      set work_id = excluded.work_id, notes = coalesce(maintenance_events.notes, excluded.notes);
  end if;
  return new;
end $$;
create trigger work_orders_log_completed after insert or update of status on work_orders
for each row execute function log_completed_work();

create trigger audit after insert or update or delete on engine_conditions  for each row execute function audit_row('asset_id');
create trigger audit after insert or update or delete on powerhouse_reports for each row execute function audit_row('facility_id');
create trigger audit after insert or update or delete on work_orders        for each row execute function audit_row();
create trigger audit after insert or update or delete on work_updates       for each row execute function audit_row();
create trigger audit after insert or update or delete on maintenance_events for each row execute function audit_row();

-- Alif Alif atoll: powerhouses that send condition reports to SRD -----------
insert into atolls (code, name) values ('AA', 'Alif Alif') on conflict (code) do nothing;
insert into islands (atoll_id, name)
select a.id, n.name from atolls a
cross join (values ('Bodufolhudhoo'), ('Feridhoo'), ('Himandhoo'), ('Maalhos'),
                   ('Mathiveri'), ('Rasdhoo'), ('Thoddoo'), ('Ukulhas')) as n(name)
where a.code = 'AA'
on conflict (atoll_id, name) do nothing;
insert into facilities (island_id, service, kind, name)
select i.id, 'electricity', 'powerhouse', i.name || ' Powerhouse'
  from islands i join atolls a on a.id = i.atoll_id
 where a.code = 'AA'
on conflict (island_id, name) do nothing;
