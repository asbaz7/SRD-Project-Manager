-- Access tokens for other systems (Oct 2026), e.g. the Fleet Manager
-- connector: it acts as a service account (no password sign-in, not listed
-- among people) whose changes are signed with that account's name. Only the
-- token's SHA-256 hash is stored; the token is shown once when created.

alter table users add column service_account boolean not null default false;

create table api_tokens (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references users(id) on delete cascade,
  name         text not null,
  token_hash   bytea not null unique,
  token_hint   text not null,                -- last 4 characters, to recognise it
  created_by   uuid references users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create trigger audit after insert or update or delete on api_tokens for each row execute function audit_row();
