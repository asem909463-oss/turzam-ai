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

-- ---------- Row Level Security: every user sees ONLY their own rows ----------

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.folders enable row level security;

drop policy if exists "profiles own" on public.profiles;
create policy "profiles own" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "conversations own" on public.conversations;
create policy "conversations own" on public.conversations
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "messages own" on public.messages;
create policy "messages own" on public.messages
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

drop policy if exists "folders own" on public.folders;
create policy "folders own" on public.folders
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "memories own" on public.memories;
create policy "memories own" on public.memories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

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
-- One row per AI call. Nobody can read or write this table directly; only consume_quota() touches it,
-- and it always works on the signed-in user (auth.uid()), never on a user id passed in.

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now()
);
create index if not exists usage_events_lookup on public.usage_events (user_id, kind, created_at desc);
alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;

-- Returns {"ok": true} and records the call, or {"ok": false, "reason": "minute"|"day", "retry_after": seconds}.
-- The limits come from the Edge Function (secrets LIMIT_*), but are capped here so nobody can fill the table.
create or replace function public.consume_quota(p_kind text, p_per_minute int, p_per_day int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  per_min int := least(greatest(coalesce(p_per_minute, 1), 1), 120);
  per_day int := least(greatest(coalesce(p_per_day, 1), 1), 5000);
  n_min int;
  n_day int;
  oldest timestamptz;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth', 'retry_after', 60);
  end if;
  if p_kind not in ('chat', 'search', 'aux', 'transcribe', 'delete') then
    return jsonb_build_object('ok', false, 'reason', 'kind', 'retry_after', 60);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_kind, 0));
  delete from public.usage_events where user_id = uid and created_at < now() - interval '2 days';

  select count(*), min(created_at) into n_min, oldest
    from public.usage_events
    where user_id = uid and kind = p_kind and created_at > now() - interval '1 minute';
  if n_min >= per_min then
    return jsonb_build_object('ok', false, 'reason', 'minute',
      'retry_after', greatest(1, ceil(extract(epoch from (oldest + interval '1 minute' - now())))::int));
  end if;

  select count(*), min(created_at) into n_day, oldest
    from public.usage_events
    where user_id = uid and kind = p_kind and created_at > now() - interval '1 day';
  if n_day >= per_day then
    return jsonb_build_object('ok', false, 'reason', 'day',
      'retry_after', greatest(1, ceil(extract(epoch from (oldest + interval '1 day' - now())))::int));
  end if;

  insert into public.usage_events (user_id, kind) values (uid, p_kind);
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.consume_quota(text, int, int) from public, anon;
grant execute on function public.consume_quota(text, int, int) to authenticated;
