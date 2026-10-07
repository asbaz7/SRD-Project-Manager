-- A "staff" role with permissions chosen per user (Oct 2026).
-- Staff see what viewers see; each staff user can also be allowed to:
--   documents   send documents for signature (and manage the ones they sent)
--   incidents   report incidents (and edit their own)
--   work        post updates and move work along (not create, complete or cancel it)
--   projects    create projects
alter type user_role add value if not exists 'staff';
alter table users add column permissions text[] not null default '{}'
  check (permissions <@ array['documents', 'incidents', 'work', 'projects']::text[]);
