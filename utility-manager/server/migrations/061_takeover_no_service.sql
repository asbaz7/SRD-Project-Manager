-- "Not applicable" on the takeover list becomes "No service yet" (Oct 2026):
-- islands without a water or sewerage service (no plant, no network) say so
-- plainly. Like other_operator it is outside the takeover. K. Malé, the one
-- island set as not applicable, has its water and sewerage run by MWSC.
update takeover_islands
   set water_status = 'other_operator', sewerage_status = 'other_operator',
       notes = trim(both ' ' from coalesce(notes || ' ', '') || 'Water and sewerage run by MWSC.')
 where atoll_code = 'K' and name = 'Malé' and water_status = 'not_applicable' and sewerage_status = 'not_applicable';

do $$
declare svc text;
begin
  foreach svc in array array['electricity', 'water', 'sewerage'] loop
    execute format('update takeover_islands set %1$s_status = ''no_service'', %1$s_on = null where %1$s_status = ''not_applicable''', svc);
    execute format('alter table takeover_islands drop constraint takeover_islands_%s_status_check', svc);
    execute format($f$alter table takeover_islands add constraint takeover_islands_%s_status_check
      check (%s_status in ('taken_over', 'fenaka', 'other_operator', 'no_service'))$f$, svc, svc);
  end loop;
end $$;
