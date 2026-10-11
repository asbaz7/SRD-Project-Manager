-- The Telegram assistant (Oct 2026): plain-language messages answered by
-- Claude, which looks things up through the API as the person asking.
--
-- One conversation per person per chat, so follow-ups ("and Omadhoo?") work.
-- messages: the conversation as sent to Claude, only ever appended to; it
-- starts afresh after a quiet spell or once it grows long.
-- pending: a change Claude proposed (status, work update, incident, new work)
-- that waits for the person to tap ✅ or ❌. Nothing is written before that.

create table telegram_conversations (
  chat_id    bigint not null,
  user_id    uuid not null references users(id) on delete cascade,
  messages   jsonb not null default '[]',
  pending    jsonb,
  updated_at timestamptz not null default now(),
  primary key (chat_id, user_id)
);
