-- Condition report history, and reports sent by Fleet Manager (Oct 2026).
--
-- Until now only the latest report was kept (engine_conditions,
-- powerhouse_reports): once September's sheet came in, August's was gone, so
-- a disputed date could not be checked against what the island reported.
-- Every month received is now kept, per source: an uploaded workbook, or
-- Fleet Manager, which collects the islands' sheets from OneDrive, checks
-- them row by row and sends each powerhouse's report over the API. When both
-- send the same month and disagree, both are kept and shown side by side.
-- engine_conditions / powerhouse_reports stay as the latest-report cache the
-- dashboard reads.

create table engine_reports (
  asset_id      uuid not null references assets(id) on delete cascade,
  report_month  date not null,
  source        text not null check (source in ('upload', 'fleet_manager')),
  reported_on   date,
  status_text   text,
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
  source_ref    text,                        -- e.g. 'ECR import #412'
  received_by   uuid references users(id),
  received_at   timestamptz not null default now(),
  primary key (asset_id, report_month, source)
);

create table powerhouse_report_history (
  facility_id      uuid not null references facilities(id) on delete cascade,
  report_month     date not null,
  source           text not null check (source in ('upload', 'fleet_manager')),
  reported_on      date,
  peak_load_kw     numeric,
  peak_load_at     timestamptz,
  peak_load_record text,                     -- as written on the sheet (uploads)
  peak_load_month  text,
  genset_count     integer,
  file_name        text,
  held_rows        jsonb,                    -- rows Fleet Manager held back: [{genset, reason}]
  source_ref       text,
  received_by      uuid references users(id),
  received_at      timestamptz not null default now(),
  primary key (facility_id, report_month, source)
);
create trigger audit after insert or update or delete on powerhouse_report_history for each row execute function audit_row('facility_id');

-- The latest report says where it came from, and carries the checked peak.
alter table powerhouse_reports
  add column source text not null default 'upload' check (source in ('upload', 'fleet_manager')),
  add column peak_load_kw numeric,
  add column peak_load_at timestamptz,
  add column held_rows jsonb;
alter table engine_conditions
  add column source text not null default 'upload' check (source in ('upload', 'fleet_manager'));

-- A history record taken from a report sent by Fleet Manager says so.
alter table maintenance_events add column origin text check (origin in ('upload', 'fleet_manager'));

-- What is kept today becomes the first month of history.
insert into engine_reports (asset_id, report_month, source, reported_on, status_text, condition, fault, total_hours,
  hours_since_overhaul, last_overhaul_on, hours_since_valve, last_valve_on, last_alt_service_on, last_battery_on,
  max_load_kw, capable_kw, needs_overhaul, alt_needs_service, overhaul_spares_received, received_by, received_at)
select asset_id, report_month, 'upload', reported_on, status_text, condition, fault, total_hours,
       hours_since_overhaul, last_overhaul_on, hours_since_valve, last_valve_on, last_alt_service_on, last_battery_on,
       max_load_kw, capable_kw, needs_overhaul, alt_needs_service, overhaul_spares_received, uploaded_by, updated_at
  from engine_conditions;

insert into powerhouse_report_history (facility_id, report_month, source, reported_on, peak_load_record, peak_load_month,
  genset_count, file_name, received_by, received_at)
select facility_id, report_month, 'upload', reported_on, peak_load_record, peak_load_month, genset_count, file_name,
       uploaded_by, uploaded_at
  from powerhouse_reports;
