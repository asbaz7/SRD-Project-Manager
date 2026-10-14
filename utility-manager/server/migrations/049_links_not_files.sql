-- No files are stored any more (Oct 2026): projects, documents and surveys
-- link to files kept in Microsoft 365 (OneDrive / SharePoint), opened and
-- edited there. Uploads, versions, the R2 bucket and the 30-day deletion of
-- closed projects' files go. None were stored on live when this ran; it
-- stops rather than delete any that are.
do $$
begin
  if exists (select 1 from project_files) or exists (select 1 from document_files) or exists (select 1 from survey_files) then
    raise exception 'Files are still stored: move them to Microsoft 365 and remove them first';
  end if;
end $$;

drop trigger projects_files_countdown on projects;
drop function project_files_countdown();
alter table projects drop column files_delete_after;
drop table project_files;
drop table document_files;
drop table survey_files;

create table document_links (
  id          bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete cascade,
  title       text not null,
  url         text not null check (url ~ '^https://'),
  added_by    uuid references users(id) on delete set null,
  added_at    timestamptz not null default now()
);
create index document_links_document_idx on document_links (document_id);
create trigger audit after insert or update or delete on document_links for each row execute function audit_row('document_id');

create table survey_links (
  id          bigint generated always as identity primary key,
  survey_id   bigint not null references surveys(id) on delete cascade,
  title       text not null,
  url         text not null check (url ~ '^https://'),
  added_by    uuid references users(id) on delete set null,
  added_at    timestamptz not null default now()
);
create index survey_links_survey_idx on survey_links (survey_id);
create trigger audit after insert or update or delete on survey_links for each row execute function audit_row('survey_id');
