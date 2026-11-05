-- RLS policies do not grant SQL privileges by themselves. These narrow ACLs restore the
-- signed-in client operations used by Turzam AI, while the existing owner RLS policies remain
-- responsible for row isolation. Revoke stray non-DML privileges from public API roles first.
revoke all on table public.profiles, public.conversations, public.messages, public.memories,
  public.folders, public.projects, public.project_files from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.profiles, public.conversations, public.messages,
  public.memories, public.folders, public.projects, public.project_files to authenticated;
grant all privileges on table public.profiles, public.conversations, public.messages, public.memories,
  public.folders, public.projects, public.project_files to service_role;

-- Founder-admin analytics reads usage_events with the trusted service role. Quota writes remain
-- in the SECURITY DEFINER RPC; no client/API role receives access to this table.
grant select on public.usage_events to service_role;
