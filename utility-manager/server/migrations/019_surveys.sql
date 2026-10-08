-- Surveys (Oct 2026): forms of several kinds, each defined by a template in
-- src/surveyTemplates.js (first: the Island Assessment for taking over a new
-- powerhouse). Answers are kept as JSON keyed by the template's sections and
-- fields; repeating sections (gensets, feeders…) are arrays.

create table surveys (
  id            bigint generated always as identity primary key,
  template      text not null,
  title         text not null,
  island_id     uuid references islands(id),
  location_name text,                            -- when the place isn't in the register
  surveyed_on   date,
  status        text not null default 'draft' check (status in ('draft', 'completed')),
  answers       jsonb not null default '{}',
  created_by    uuid references users(id) on delete set null,
  updated_by    uuid references users(id) on delete set null,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (island_id is not null or location_name is not null)
);
create index surveys_template_idx on surveys (template, created_at desc);
create index surveys_island_idx on surveys (island_id);
create trigger surveys_touch before update on surveys for each row execute function touch_updated_at();
create trigger audit after insert or update or delete on surveys for each row execute function audit_row();

create table survey_files (
  id           bigint generated always as identity primary key,
  survey_id    bigint not null references surveys(id) on delete cascade,
  file_name    text not null,
  content_type text not null,
  size_bytes   integer not null,
  data         bytea not null,
  uploaded_by  uuid references users(id) on delete set null,
  uploaded_at  timestamptz not null default now()
);
create index survey_files_survey_idx on survey_files (survey_id);

-- Staff can be allowed to carry out surveys.
alter table users drop constraint users_permissions_check;
alter table users add constraint users_permissions_check
  check (permissions <@ array['documents', 'incidents', 'work', 'projects', 'surveys']::text[]);
