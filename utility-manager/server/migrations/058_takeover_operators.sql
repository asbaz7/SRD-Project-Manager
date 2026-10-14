-- Two more states for a service on the takeover list (Oct 2026):
--   fenaka          still run by FENAKA, survey not started ('pending' is
--                   shown as "Survey ongoing" since 2026-10-14);
--   other_operator  run by someone else (MWSC, a private party), so not part
--                   of the FENAKA to STELCO takeover. Who, in the notes.
-- ADh. Maamigili (private party, set as not applicable) becomes
-- other_operator. Raa: Dhuvaafaru run by MWSC, the rest by FENAKA.
do $$
declare svc text;
begin
  foreach svc in array array['electricity', 'water', 'sewerage'] loop
    execute format('alter table takeover_islands drop constraint takeover_islands_%s_status_check', svc);
    execute format($f$alter table takeover_islands add constraint takeover_islands_%s_status_check
      check (%s_status in ('taken_over', 'pending', 'fenaka', 'other_operator', 'not_applicable'))$f$, svc, svc);
  end loop;
end $$;

update takeover_islands set electricity_status = 'other_operator'
 where atoll_code = 'ADh' and name = 'Maamigili' and electricity_status = 'not_applicable';

update takeover_islands
   set electricity_status = 'other_operator', water_status = 'other_operator', sewerage_status = 'other_operator',
       electricity_on = null, water_on = null, sewerage_on = null,
       notes = trim(both ' ' from coalesce(notes || ' ', '') || 'Utilities run by MWSC.')
 where atoll_code = 'R' and name = 'Dhuvaafaru' and electricity_status is null;

update takeover_islands set electricity_status = 'fenaka'
 where atoll_code = 'R' and name <> 'Dhuvaafaru' and electricity_status is null;
