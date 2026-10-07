-- Gensets (and other assets) moved between islands (Oct 2026).
-- The asset keeps its identity, so its maintenance history, running hours,
-- condition and status log move with it; each move is recorded here.
create table asset_moves (
  id               bigint generated always as identity primary key,
  asset_id         uuid not null references assets(id) on delete cascade,
  from_facility_id uuid references facilities(id) on delete set null,
  to_facility_id   uuid references facilities(id) on delete set null,
  from_tag         text not null,
  to_tag           text not null,
  moved_on         date not null,
  notes            text,
  source           text not null default 'manual' check (source in ('manual', 'report')),
  moved_by         uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index asset_moves_asset_idx on asset_moves (asset_id, moved_on desc);
create trigger audit after insert or update or delete on asset_moves for each row execute function audit_row();
