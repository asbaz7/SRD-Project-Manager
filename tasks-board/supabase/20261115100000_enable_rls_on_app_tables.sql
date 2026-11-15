-- Applied 2026-11-15 to SRD Utility Manager (nupbpsowqhhkjvsdbstj).
-- Blocks the public API key from the app's own tables before the board publishes
-- that key. The app connects directly as the table owner (postgres, which
-- bypasses RLS), so it is unaffected. No policies are added on purpose.
do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
      and c.relname not like 'scrd_board_%'
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- 2026-11-15: the editor check is for signed-in users only
revoke execute on function public.is_scrd_board_editor() from anon;
