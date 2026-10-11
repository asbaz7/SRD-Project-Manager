-- Whoever posts an update on work or a project may correct its text for
-- 8 hours after posting it (Oct 2026). edited_at shows it was changed; the
-- audit trail keeps the original wording.
alter table work_updates    add column edited_at timestamptz;
alter table project_updates add column edited_at timestamptz;
