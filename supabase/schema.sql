-- Turzam AI database schema.
-- Run this ONCE: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.

-- ---------- Tables ----------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  memory_enabled boolean not null default true,
  default_mode text not null default 'founder',
  default_model text not null default 'auto',
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  mode text not null default 'founder',
  model text not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'model')),
  content text not null default '',
  image_path text,
  attachments jsonb not null default '[]'::jsonb,
  provider text,
  created_at timestamptz not null default now()
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  content text not null check (char_length(content) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx on public.conversations (user_id, updated_at desc);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists memories_user_idx on public.memories (user_id, created_at desc);


-- ---------- Upgrades (safe to run again on an existing project) ----------

alter table public.profiles add column if not exists default_model text not null default 'auto';
alter table public.profiles alter column default_mode set default 'founder';
alter table public.conversations add column if not exists model text not null default 'auto';
alter table public.conversations alter column mode set default 'founder';
alter table public.messages add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.messages add column if not exists provider text;

-- v1.2 upgrades: personalities, custom instructions, search sources, folders, pins, archive.
alter table public.profiles add column if not exists custom_instructions text not null default '' check (char_length(custom_instructions) <= 1500);
alter table public.profiles add column if not exists default_persona text not null default 'none';
alter table public.profiles add column if not exists voice_reply boolean not null default true;
alter table public.profiles add column if not exists voice_lang text not null default '';
alter table public.conversations add column if not exists persona text not null default 'none';
alter table public.conversations add column if not exists pinned boolean not null default false;
alter table public.conversations add column if not exists archived boolean not null default false;
alter table public.messages add column if not exists sources jsonb not null default '[]'::jsonb;
alter table public.memories add column if not exists pinned boolean not null default false;

create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 40),
  color text not null default '#3D8BFF',
  created_at timestamptz not null default now()
);
alter table public.conversations add column if not exists folder_id uuid references public.folders(id) on delete set null;
create index if not exists conversations_folder_idx on public.conversations(user_id, folder_id);

-- v1.3 additive project workspaces.
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  instructions text not null default '' check (char_length(instructions) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 180),
  mime text not null,
  size bigint not null check (size between 0 and 10485760),
  path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.conversations add column if not exists project_id uuid references public.projects(id) on delete set null;
create index if not exists conversations_project_idx on public.conversations(user_id, project_id, updated_at desc);
create index if not exists project_files_project_idx on public.project_files(project_id, created_at desc);


-- ---------- Row Level Security: every user sees ONLY their own rows ----------

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.folders enable row level security;
alter table public.projects enable row level security;
alter table public.project_files enable row level security;

drop policy if exists "profiles own" on public.profiles;
create policy "profiles own" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "conversations own" on public.conversations;
-- Repair invalid legacy folder links before the stricter write check is installed.
update public.conversations c
set folder_id = null
where c.folder_id is not null
  and not exists (
    select 1 from public.folders f
    where f.id = c.folder_id and f.user_id = c.user_id
  );
create policy "conversations own" on public.conversations
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and (public.conversations.folder_id is null or exists (
      select 1 from public.folders f where f.id = public.conversations.folder_id and f.user_id = auth.uid()
    ))
    and (public.conversations.project_id is null or exists (select 1 from public.projects p where p.id = public.conversations.project_id and p.user_id = auth.uid()))
  );

drop policy if exists "messages own" on public.messages;
create policy "messages own" on public.messages
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

drop policy if exists "folders own" on public.folders;
create policy "folders own" on public.folders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "projects own" on public.projects;
create policy "projects own" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "project files own" on public.project_files;
create policy "project files own" on public.project_files
  for all using (
    user_id = auth.uid()
    and exists (select 1 from public.projects p where p.id = public.project_files.project_id and p.user_id = auth.uid())
  ) with check (
    user_id = auth.uid()
    and exists (select 1 from public.projects p where p.id = public.project_files.project_id and p.user_id = auth.uid())
  );

drop policy if exists "memories own" on public.memories;
create policy "memories own" on public.memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- (The old daily counter consume_turzam_ai_action / ai_usage was replaced by consume_quota below and is removed.)
drop function if exists public.consume_turzam_ai_action();
drop table if exists public.ai_usage;

-- ---------- Automatic behaviour ----------

-- Create a profile row when someone signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Move a conversation to the top of the history when a message is added.
create or replace function public.bump_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set updated_at = now() where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.bump_conversation();

-- ---------- Private storage for uploaded images, PDFs and files ----------

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 10485760)
on conflict (id) do update set file_size_limit = 10485760, public = false;

drop policy if exists "attachments read own" on storage.objects;
create policy "attachments read own" on storage.objects
  for select using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments insert own" on storage.objects;
create policy "attachments insert own" on storage.objects
  for insert with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments delete own" on storage.objects;
create policy "attachments delete own" on storage.objects
  for delete using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);


-- ---------- Usage limits (v1.3) ----------
-- One row per AI call. No API client can read or write this table or execute consume_quota().
-- Only trusted Edge Functions call the RPC with a verified user ID and server-side limits.

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_lookup on public.usage_events (user_id, kind, created_at desc);
create index if not exists usage_events_global on public.usage_events (kind, created_at desc);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from public, anon, authenticated, service_role;

-- Returns {"ok": true} and records the call, or {"ok": false, "reason": "minute"|"day", "retry_after": seconds}.
-- The Edge Function supplies limits from server secrets. Execution is service_role-only; the public API roles
-- cannot choose another user's ID, change their own counters, or burn the global cap.
drop function if exists public.consume_quota(text, int, int);
drop function if exists public.consume_quota(text, int, int, int);
create or replace function public.consume_quota(
  p_user_id uuid,
  p_kind text,
  p_per_minute int,
  p_per_day int,
  p_global_per_day int default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  per_min int := least(greatest(coalesce(p_per_minute, 1), 1), 120);
  per_day int := least(greatest(coalesce(p_per_day, 1), 1), 5000);
  global_day int := case when p_global_per_day is null then null else least(greatest(p_global_per_day, 1), 10000000) end;
  n_min int;
  n_day int;
  oldest timestamptz;
  n_all int;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'auth', 'retry_after', 60);
  end if;
  if p_kind is null or p_kind not in ('chat', 'search', 'aux', 'transcribe', 'delete') then
    return jsonb_build_object('ok', false, 'reason', 'kind', 'retry_after', 60);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_kind, 0));
  delete from public.usage_events where user_id = p_user_id and created_at < now() - interval '2 days';

  select count(*), min(created_at) into n_min, oldest
    from public.usage_events
    where user_id = p_user_id and kind = p_kind and created_at > now() - interval '1 minute';
  if n_min >= per_min then
    return jsonb_build_object('ok', false, 'reason', 'minute',
      'retry_after', greatest(1, ceil(extract(epoch from (oldest + interval '1 minute' - now())))::int));
  end if;

  select count(*), min(created_at) into n_day, oldest
    from public.usage_events
    where user_id = p_user_id and kind = p_kind and created_at > now() - interval '1 day';
  if n_day >= per_day then
    return jsonb_build_object('ok', false, 'reason', 'day',
      'retry_after', greatest(1, ceil(extract(epoch from (oldest + interval '1 day' - now())))::int));
  end if;

  -- Optional cap across ALL users (protects the AI bill from many accounts). NULL = off.
  -- Without a lock, many users checking at the same moment would all see "under the cap" and all insert.
  -- This transaction-level lock (one per action type, released automatically at commit) makes the
  -- count-then-insert below happen one caller at a time. Lock order is always user lock, then global lock.
  if global_day is not null then
    perform pg_advisory_xact_lock(hashtextextended('global:' || p_kind, 0));
    select count(*) into n_all from public.usage_events where kind = p_kind and created_at > now() - interval '1 day';
    if n_all >= global_day then
      return jsonb_build_object('ok', false, 'reason', 'global', 'retry_after', 300);
    end if;
  end if;

  insert into public.usage_events (user_id, kind) values (p_user_id, p_kind);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.consume_quota(uuid, text, int, int, int) from public, anon, authenticated;
grant execute on function public.consume_quota(uuid, text, int, int, int) to service_role;
