-- Telegram bot (Oct 2026).
--   * A manager links their Telegram account to their login once, with a
--     short-lived code from their account page; the bot then acts as them
--     (same permissions, island scope and audit trail as the website).
--   * Group or private chats that receive alerts and the daily summary.

alter table users
  add column telegram_user_id bigint,
  add column telegram_name    text;
create unique index users_telegram_key on users (telegram_user_id) where telegram_user_id is not null;

create table telegram_link_codes (
  code       text primary key,
  user_id    uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null
);

create table telegram_chats (
  chat_id    bigint primary key,
  title      text,
  alerts     boolean not null default true,
  added_by   uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create trigger audit after insert or update or delete on telegram_chats for each row execute function audit_row('chat_id');
