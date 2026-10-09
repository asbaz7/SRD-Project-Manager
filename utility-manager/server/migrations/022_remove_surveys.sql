-- Surveys removed (Oct 2026): surveys, and "unverified" gensets, are done in
-- the Fleet Manager instead. The one survey on live was an empty draft.
update users set permissions = array_remove(permissions, 'surveys') where 'surveys' = any(permissions);
alter table users drop constraint users_permissions_check;
alter table users add constraint users_permissions_check
  check (permissions <@ array['documents', 'incidents', 'work', 'projects']::text[]);
drop table survey_files;
drop table surveys;
