-- Documents sent for signature (Oct 2026), replacing the "E-sign status"
-- Microsoft List the admin staff kept: one row per document, the people who
-- must sign it (in order), who has signed, files, and a notes timeline.
-- Status, "completed by" and the last approval date follow from the signers.

create table documents (
  id          bigint generated always as identity primary key,
  ref         text not null,                 -- their Agreement ID: D-010-2026, RPT/2026/22, ADM/2026/001…
  doc_type    text not null,                 -- Allowance form, Tender, Job description…
  title       text,                          -- optional subject
  sent_by     uuid references users(id) on delete set null,
  sent_by_name text,                         -- when the sender has no login
  sent_on     date not null,
  status      text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  notes       text,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index documents_ref_key on documents (lower(ref));
create index documents_status_idx on documents (status, sent_on desc);
create trigger documents_touch before update on documents for each row execute function touch_updated_at();
create trigger audit after insert or update or delete on documents for each row execute function audit_row();

create table document_signers (
  id          bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete cascade,
  position    integer not null,
  user_id     uuid references users(id) on delete set null,
  name        text not null,                 -- shown name (copied from the user, or typed)
  signed_on   date,
  recorded_by uuid references users(id) on delete set null,
  recorded_at timestamptz,
  note        text
);
create index document_signers_doc_idx on document_signers (document_id, position);
create index document_signers_user_idx on document_signers (user_id) where signed_on is null;
create trigger audit after insert or update or delete on document_signers for each row execute function audit_row('document_id');

create table document_files (
  id           bigint generated always as identity primary key,
  document_id  bigint not null references documents(id) on delete cascade,
  file_name    text not null,
  content_type text not null,
  size_bytes   integer not null,
  data         bytea not null,
  uploaded_by  uuid references users(id) on delete set null,
  uploaded_at  timestamptz not null default now()
);
create index document_files_doc_idx on document_files (document_id);

create table document_updates (
  id          bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete cascade,
  body        text not null,
  created_by  uuid references users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index document_updates_doc_idx on document_updates (document_id, created_at desc);
