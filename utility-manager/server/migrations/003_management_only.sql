-- The system is now used by management staff only. Operator accounts are
-- retired: switched off, signed out and set to read-only, so their past
-- entries keep their names in the history. No new operators can be created.
-- The daily-log tables (metrics, readings) are kept but no longer used, so
-- nothing already entered is lost.
update users set active = false, role = 'viewer' where role = 'operator';
delete from sessions s using users u where u.id = s.user_id and not u.active;
alter table users add constraint users_no_operator_role check (role <> 'operator');
