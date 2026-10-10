-- Service intervals: overhauls and alternator services fall due by rule
-- (Oct 2026), not only when an island ticks "needs overhaul" / "alternator
-- needs service" on its sheet. Next due = the last one + the interval.
--
-- One region-wide row (model_match null) and optional rows per engine model.
-- A model row applies to every genset whose make / model contains its text
-- (case-insensitive, e.g. 'KTA38'); the longest match wins, and a blank
-- interval on it falls back to the region's. A date or hours set on the
-- genset itself (next_overhaul_on / _hours, next_alt_service_on) still wins.

create table service_intervals (
  id                 bigint generated always as identity primary key,
  model_match        text unique check (model_match is null or length(trim(model_match)) >= 2),
  overhaul_hours     numeric check (overhaul_hours is null or overhaul_hours > 0),
  alt_service_months integer check (alt_service_months is null or alt_service_months > 0),
  updated_by         uuid references users(id),
  updated_at         timestamptz not null default now()
);
create unique index service_intervals_one_region on service_intervals ((true)) where model_match is null;
create trigger audit after insert or update or delete on service_intervals for each row execute function audit_row();

-- Starting point, to be adjusted: overhaul every 20,000 running hours,
-- alternator service every 12 months.
insert into service_intervals (model_match, overhaul_hours, alt_service_months) values (null, 20000, 12);
