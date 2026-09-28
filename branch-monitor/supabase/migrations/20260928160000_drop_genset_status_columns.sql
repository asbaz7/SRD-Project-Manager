-- Genset status now comes from the shared Google Sheet (see lib/sheet.js).
-- These columns were never filled; apply after the app stops reading them.
alter table public.gensets
  drop column if exists running,
  drop column if exists status_note,
  drop column if exists status_date;
