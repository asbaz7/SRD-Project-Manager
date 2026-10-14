-- The system works on its own (Oct 2026): outside systems no longer connect.
-- Fleet Manager's access token is revoked and its service account switched
-- off (signed out everywhere). The reports it sent stay, marked as from Fleet
-- Manager, as history; the app no longer accepts tokens or reports from
-- outside (see auth.js and routes/conditionReports.js).
update api_tokens set revoked_at = now() where revoked_at is null;
delete from sessions where user_id in (select id from users where service_account);
update users set active = false where service_account and active;
