-- Uploaded files move to R2 (Oct 2026): a file row keeps its name, type,
-- size and uploader, and either the bytes (data, as before: Node.js and
-- development) or the key of its object in the R2 bucket (storage_key).
-- No files had been uploaded on live yet, so nothing is moved.
alter table project_files  alter column data drop not null, add column storage_key text,
  add constraint project_files_stored check (data is not null or storage_key is not null);
alter table document_files alter column data drop not null, add column storage_key text,
  add constraint document_files_stored check (data is not null or storage_key is not null);
alter table survey_files   alter column data drop not null, add column storage_key text,
  add constraint survey_files_stored check (data is not null or storage_key is not null);
