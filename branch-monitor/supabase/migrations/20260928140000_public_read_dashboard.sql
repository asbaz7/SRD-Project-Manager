-- The dashboard has no login: allow read-only public access to the
-- atoll / island / powerhouse / genset hierarchy. Nothing else is exposed,
-- and there are no public write policies.

create policy atolls_public_read on public.atolls
for select to anon using (active);

create policy islands_public_read on public.islands
for select to anon using (active);

create policy powerhouses_public_read on public.powerhouses
for select to anon using (active);

create policy gensets_public_read on public.gensets
for select to anon using (true);

grant select on public.atolls, public.islands, public.powerhouses, public.gensets to anon;
