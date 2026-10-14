-- Survey progress on the takeover list (Oct 2026). Before an island's
-- utilities move from FENAKA to STELCO they are surveyed; the survey is per
-- island (one team visit covers its services), tracked apart from who runs
-- each service:
--   survey_stage  null (not started), planned, ongoing, completed
--   survey_start  planned start, or when it started
--   survey_end    when it was completed
--   survey_team   who is on it
--   survey_link   the survey report in Microsoft 365 (no files kept here)
-- Services "survey ongoing" ('pending', since migration 053) become "under
-- FENAKA" with the island's survey ongoing, from the earliest such date.
alter table takeover_islands
  add column survey_stage text check (survey_stage in ('planned', 'ongoing', 'completed')),
  add column survey_start date,
  add column survey_end   date,
  add column survey_team  text,
  add column survey_link  text check (survey_link ~ '^https://');

update takeover_islands
   set survey_stage = 'ongoing',
       survey_start = least(case when electricity_status = 'pending' then electricity_on end,
                            case when water_status = 'pending' then water_on end,
                            case when sewerage_status = 'pending' then sewerage_on end)
 where 'pending' in (electricity_status, water_status, sewerage_status);

update takeover_islands set
  electricity_on = case when electricity_status = 'pending' then null else electricity_on end,
  water_on = case when water_status = 'pending' then null else water_on end,
  sewerage_on = case when sewerage_status = 'pending' then null else sewerage_on end,
  electricity_status = case when electricity_status = 'pending' then 'fenaka' else electricity_status end,
  water_status = case when water_status = 'pending' then 'fenaka' else water_status end,
  sewerage_status = case when sewerage_status = 'pending' then 'fenaka' else sewerage_status end
 where 'pending' in (electricity_status, water_status, sewerage_status);

do $$
declare svc text;
begin
  foreach svc in array array['electricity', 'water', 'sewerage'] loop
    execute format('alter table takeover_islands drop constraint takeover_islands_%s_status_check', svc);
    execute format($f$alter table takeover_islands add constraint takeover_islands_%s_status_check
      check (%s_status in ('taken_over', 'fenaka', 'other_operator', 'not_applicable'))$f$, svc, svc);
  end loop;
end $$;
