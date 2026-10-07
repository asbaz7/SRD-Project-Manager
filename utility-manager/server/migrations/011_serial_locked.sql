-- A serial number corrected by hand wins over the condition reports (Oct 2026).
-- Island report templates sometimes carry a wrong serial; without this, the
-- next upload would write it back, and could be mistaken for a genset moved
-- in from wherever that serial is really registered.
alter table assets add column serial_locked boolean not null default false;
