-- Which powerhouses are chased for condition reports (Oct 2026).
--
-- Every powerhouse without a report for the month counted as missing, but
-- most of those had never been surveyed by STELCO (the F / Dh / Th units
-- handed over in 2026), so chasing them was pointless and hid the few that
-- really are late. A powerhouse is now chased from `reports_from`, the
-- first month a report is expected. Empty = not yet (not surveyed); its
-- first report sets it.

alter table facilities add column reports_from date
  check (reports_from is null or extract(day from reports_from) = 1);

-- Powerhouses that have reported are chased as before; those that never
-- have wait until someone sets the month or their first report comes in.
update facilities f set reports_from = date '2024-01-01'
 where f.service = 'electricity' and f.kind = 'powerhouse'
   and exists (select 1 from powerhouse_reports r where r.facility_id = f.id);
