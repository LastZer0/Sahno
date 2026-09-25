-- Anonymous catalog must not reference organization_members: anon has no
-- SELECT privilege there, and PostgreSQL does not promise short-circuiting.
drop policy "published event catalog" on public.events;
create policy "published event catalog" on public.events
  for select to anon using (status='published');
create policy "authenticated event catalog" on public.events
  for select to authenticated using (
    status='published' or (select auth.uid()) in (
      select m.user_id from public.organization_members m
      where m.organization_id=events.organization_id
    )
  );
