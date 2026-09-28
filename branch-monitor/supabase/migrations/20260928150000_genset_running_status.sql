-- Running status per genset, imported from a spreadsheet.
-- running: true = running, false = not running, null = no status yet.
alter table public.gensets
  add column if not exists running boolean,
  add column if not exists status_note text,
  add column if not exists status_date date;
