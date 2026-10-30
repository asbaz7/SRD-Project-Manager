-- Monthly updates for water plants and sewerage systems (Oct 2026), as the
-- gensets have theirs: once a month each plant records, per asset (RO
-- unit, pump, system), its status, running hours and any fault; water
-- plants also the water produced that month. Status changes go through the
-- status log as everywhere else; the month's figures are kept here.

create table plant_updates (
  id            bigint generated always as identity primary key,
  facility_id   uuid not null references facilities(id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  produced_m3   numeric check (produced_m3 >= 0),
  note          text,
  updated_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (facility_id, month)
);
create trigger audit after insert or update or delete on plant_updates for each row execute function audit_row();

create table plant_asset_updates (
  id            bigint generated always as identity primary key,
  asset_id      uuid not null references assets(id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  status        text,
  running_hours numeric check (running_hours >= 0),
  fault         text,
  updated_by    uuid references users(id) on delete set null,
  updated_at    timestamptz not null default now(),
  unique (asset_id, month)
);
create index plant_asset_updates_asset_idx on plant_asset_updates (asset_id, month desc);
create trigger audit after insert or update or delete on plant_asset_updates for each row execute function audit_row();
