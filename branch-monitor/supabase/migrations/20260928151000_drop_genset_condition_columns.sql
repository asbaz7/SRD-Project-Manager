-- Genset status comes from `running` / `status_note` / `status_date`
-- (spreadsheet import). Remove the duplicate condition fields.
-- Apply only after the app no longer reads these columns.
alter table public.gensets
  drop column if exists condition_status,
  drop column if exists condition_note;
