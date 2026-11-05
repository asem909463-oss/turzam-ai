-- Explicitly document the existing fail-closed boundary for server-only deletion state.
-- This leaves service-role access and all existing recovery records unchanged.
drop policy if exists "deny client access" on public.account_deletion_jobs;
create policy "deny client access" on public.account_deletion_jobs
  for all to anon, authenticated using (false) with check (false);
