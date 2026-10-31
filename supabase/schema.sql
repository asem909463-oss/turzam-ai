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

-- v1.3 additive project workspaces and daily AI action metering.
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

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null default current_date,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

-- ---------- Row Level Security: every user sees ONLY their own rows ----------

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
alter table public.folders enable row level security;
alter table public.projects enable row level security;
alter table public.project_files enable row level security;
alter table public.ai_usage enable row level security;

drop policy if exists "profiles own" on public.profiles;
create policy "profiles own" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "conversations own" on public.conversations;
create policy "conversations own" on public.conversations
  for all using (user_id = auth.uid()) with check (
    user_id = auth.uid()
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

-- The app never reads or writes usage rows directly. This security-definer RPC performs
-- an atomic per-user daily increment and is called only by the authenticated edge function.
create or replace function public.consume_turzam_ai_action()
returns boolean language plpgsql security definer set search_path = public as $$
declare
  current_user_id uuid := auth.uid();
  next_count integer;
begin
  if current_user_id is null then return false; end if;
  insert into public.ai_usage as current_usage (user_id, usage_date, request_count, updated_at)
  values (current_user_id, current_date, 1, now())
  on conflict (user_id, usage_date) do update
    set request_count = current_usage.request_count + 1, updated_at = now()
    where current_usage.request_count < 200
  returning request_count into next_count;
  return next_count is not null;
end;
$$;
revoke all on function public.consume_turzam_ai_action() from public, anon;
grant execute on function public.consume_turzam_ai_action() to authenticated;

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
values ('attachments', 'attachments', false, 15728640)
on conflict (id) do update set file_size_limit = 15728640, public = false;

drop policy if exists "attachments read own" on storage.objects;
create policy "attachments read own" on storage.objects
  for select using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments insert own" on storage.objects;
create policy "attachments insert own" on storage.objects
  for insert with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "attachments delete own" on storage.objects;
create policy "attachments delete own" on storage.objects
  for delete using (bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text);
