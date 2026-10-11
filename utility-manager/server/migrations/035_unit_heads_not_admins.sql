-- Nabeeh (Electrical) and Haisham (Mechanical) work as unit heads, not
-- administrators (Oct 2026). Same accounts, password and Telegram link;
-- their sessions are kept, so they stay signed in with the new access.
-- As technical managers who head a unit they log and run work and assign
-- it within their unit, but no longer manage users, the bot or the
-- island list, or see every private project and document.
update users set role = 'manager', technical = true
 where full_name in ('Ali Nabeeh Waseem', 'Haisham Jaufar') and role = 'admin';
