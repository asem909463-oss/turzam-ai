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


-- ---------- Founder Admin Panel (additive; no chat content or credentials exposed) ----------
-- Admin-only tables are never granted to anon/authenticated. Edge Functions use service_role
-- only after verifying both the Supabase user JWT and a short-lived founder-admin session.

create table if not exists public.user_activity (
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_date date not null default (timezone('utc', now()))::date,
  last_active_at timestamptz not null default now(),
  primary key (user_id, activity_date)
);
create index if not exists user_activity_date_idx on public.user_activity(activity_date, last_active_at desc);
alter table public.user_activity enable row level security;
revoke all on public.user_activity from public, anon;
grant select, insert, update on public.user_activity to authenticated;
drop policy if exists "activity own active" on public.user_activity;
create policy "activity own active" on public.user_activity
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.admin_account_control (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'premium')),
  account_status text not null default 'active' check (account_status in ('active', 'suspended')),
  suspension_note text check (suspension_note is null or char_length(suspension_note) <= 240),
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.admin_settings (key, value) values (
  'runtime',
  '{
    "quotasManaged": false,
    "quotas": {
      "free": {
        "chat": {"perMinute": 12, "perDay": 150},
        "search": {"perMinute": 6, "perDay": 40},
        "aux": {"perMinute": 30, "perDay": 400},
        "transcribe": {"perMinute": 10, "perDay": 100}
      },
      "premium": {
        "chat": {"perMinute": 30, "perDay": 1000},
        "search": {"perMinute": 12, "perDay": 200},
        "aux": {"perMinute": 60, "perDay": 2000},
        "transcribe": {"perMinute": 30, "perDay": 500}
      }
    },
    "models": {"gemini": true, "openai": true, "anthropic": true},
    "maintenance": {"enabled": false, "message": "Turzam AI is temporarily in maintenance. Please try again soon."},
    "features": {"search": true, "voiceInput": true, "attachments": true, "projects": true, "memory": true}
  }'::jsonb
) on conflict (key) do nothing;

create table if not exists public.founder_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.founder_admin_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index if not exists founder_admin_sessions_expiry_idx on public.founder_admin_sessions(expires_at);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null check (char_length(action) between 1 and 80),
  target_user_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log(created_at desc);

-- Contains operational metadata only: never prompts, responses, attachments, provider keys, or raw errors.
create table if not exists public.admin_ai_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check (kind in ('chat', 'search', 'aux', 'transcribe')),
  provider text check (provider is null or provider in ('gemini', 'openai', 'anthropic')),
  model text check (model is null or char_length(model) <= 120),
  succeeded boolean not null,
  error_code text check (error_code is null or char_length(error_code) <= 80),
  created_at timestamptz not null default now()
);
create index if not exists admin_ai_events_created_idx on public.admin_ai_events(created_at desc);
create index if not exists admin_ai_events_model_idx on public.admin_ai_events(provider, model, created_at desc);

create table if not exists public.admin_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid not null
);
create index if not exists admin_announcements_active_idx on public.admin_announcements(active, created_at desc);

alter table public.admin_account_control enable row level security;
alter table public.admin_settings enable row level security;
alter table public.founder_admins enable row level security;
alter table public.founder_admin_sessions enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.admin_ai_events enable row level security;
alter table public.admin_announcements enable row level security;
revoke all on public.admin_account_control, public.admin_settings, public.founder_admins,
  public.founder_admin_sessions, public.admin_audit_log, public.admin_ai_events,
  public.admin_announcements from public, anon, authenticated;
grant all on public.admin_account_control, public.admin_settings, public.founder_admins,
  public.founder_admin_sessions, public.admin_audit_log, public.admin_ai_events,
  public.admin_announcements to service_role;
grant usage, select on sequence public.admin_audit_log_id_seq, public.admin_ai_events_id_seq to service_role;

-- These SECURITY DEFINER helpers expose only the caller's active bit or a non-sensitive feature bit.
create or replace function public.current_account_is_active()
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select auth.uid() is not null and not exists (
    select 1 from public.admin_account_control c
    where c.user_id = auth.uid() and c.account_status = 'suspended'
  );
$$;
revoke all on function public.current_account_is_active() from public, anon;
grant execute on function public.current_account_is_active() to authenticated, service_role;

create or replace function public.current_feature_enabled(p_feature text)
returns boolean
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select coalesce(
    (select (s.value #>> array['features', p_feature])::boolean
     from public.admin_settings s where s.key = 'runtime'),
    true
  );
$$;
revoke all on function public.current_feature_enabled(text) from public, anon;
grant execute on function public.current_feature_enabled(text) to authenticated, service_role;

-- Suspended users are blocked at the database boundary, including already-issued access tokens.
drop policy if exists "profiles own" on public.profiles;
create policy "profiles own" on public.profiles
  for all using (id = auth.uid() and public.current_account_is_active())
  with check (id = auth.uid() and public.current_account_is_active());

drop policy if exists "conversations own" on public.conversations;
create policy "conversations own" on public.conversations
  for all using (user_id = auth.uid() and public.current_account_is_active()) with check (
    user_id = auth.uid() and public.current_account_is_active()
    and (folder_id is null or exists (
      select 1 from public.folders f where f.id = folder_id and f.user_id = auth.uid()
    ))
    and (project_id is null or (public.current_feature_enabled('projects') and exists (
      select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
    )))
  );

drop policy if exists "messages own" on public.messages;
create policy "messages own" on public.messages
  for all using (user_id = auth.uid() and public.current_account_is_active()) with check (
    user_id = auth.uid() and public.current_account_is_active()
    and exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid())
  );

drop policy if exists "folders own" on public.folders;
create policy "folders own" on public.folders
  for all using (user_id = auth.uid() and public.current_account_is_active())
  with check (user_id = auth.uid() and public.current_account_is_active());

drop policy if exists "projects own" on public.projects;
create policy "projects own" on public.projects
  for all using (user_id = auth.uid() and public.current_account_is_active() and public.current_feature_enabled('projects'))
  with check (user_id = auth.uid() and public.current_account_is_active() and public.current_feature_enabled('projects'));

drop policy if exists "project files own" on public.project_files;
create policy "project files own" on public.project_files
  for all using (
    user_id = auth.uid() and public.current_account_is_active()
    and public.current_feature_enabled('projects') and public.current_feature_enabled('attachments')
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  ) with check (
    user_id = auth.uid() and public.current_account_is_active()
    and public.current_feature_enabled('projects') and public.current_feature_enabled('attachments')
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists "memories own" on public.memories;
create policy "memories own" on public.memories
  for all using (user_id = auth.uid() and public.current_account_is_active() and public.current_feature_enabled('memory'))
  with check (user_id = auth.uid() and public.current_account_is_active() and public.current_feature_enabled('memory'));

drop policy if exists "attachments read own" on storage.objects;
create policy "attachments read own" on storage.objects
  for select using (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_account_is_active() and public.current_feature_enabled('attachments')
  );
drop policy if exists "attachments insert own" on storage.objects;
create policy "attachments insert own" on storage.objects
  for insert with check (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_account_is_active() and public.current_feature_enabled('attachments')
  );
drop policy if exists "attachments delete own" on storage.objects;
create policy "attachments delete own" on storage.objects
  for delete using (
    bucket_id = 'attachments' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_account_is_active()
  );

-- One request record per provider attempt. These rows intentionally contain no chat text or raw provider errors.
create or replace function public.admin_dashboard_summary()
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  with utc as (
    select (timezone('utc', now()))::date as today
  ), plans as (
    select coalesce(c.tier, 'free') as tier, count(*)::bigint as n
    from auth.users u left join public.admin_account_control c on c.user_id = u.id
    group by coalesce(c.tier, 'free')
  ), model_usage as (
    select coalesce(e.provider, 'unknown') as provider,
      coalesce(e.model, 'unknown') as model,
      count(*)::bigint as calls,
      count(*) filter (where e.succeeded)::bigint as succeeded,
      count(*) filter (where not e.succeeded)::bigint as failed
    from public.admin_ai_events e
    where e.created_at >= now() - interval '30 days'
    group by e.provider, e.model
    order by count(*) desc
    limit 12
  ), recent_errors as (
    select e.error_code, count(*)::bigint as occurrences, max(e.created_at) as last_seen
    from public.admin_ai_events e
    where not e.succeeded and e.created_at >= now() - interval '7 days'
    group by e.error_code
    order by count(*) desc
    limit 10
  ), daily_registrations as (
    select g.day::date as day, count(u.id)::bigint as count
    from utc cross join generate_series(utc.today - 29, utc.today, interval '1 day') as g(day)
    left join auth.users u on (u.created_at at time zone 'UTC')::date = g.day::date
    group by g.day::date order by g.day::date
  ), weekly_registrations as (
    select g.week::date as week, count(u.id)::bigint as count
    from utc cross join generate_series(date_trunc('week', utc.today::timestamp) - interval '11 weeks',
      date_trunc('week', utc.today::timestamp), interval '1 week') as g(week)
    left join auth.users u on date_trunc('week', u.created_at at time zone 'UTC') = g.week
    group by g.week::date order by g.week::date
  ), monthly_registrations as (
    select g.month::date as month, count(u.id)::bigint as count
    from utc cross join generate_series(date_trunc('month', utc.today::timestamp) - interval '11 months',
      date_trunc('month', utc.today::timestamp), interval '1 month') as g(month)
    left join auth.users u on date_trunc('month', u.created_at at time zone 'UTC') = g.month
    group by g.month::date order by g.month::date
  )
  select jsonb_build_object(
    'generatedAt', now(),
    'registeredUsers', (select count(*)::bigint from auth.users),
    'currentlyActiveUsers', (select count(distinct a.user_id)::bigint from public.user_activity a, utc
      where a.activity_date = utc.today and a.last_active_at >= now() - interval '5 minutes'),
    'dailyActiveUsers', (select count(distinct a.user_id)::bigint from public.user_activity a, utc where a.activity_date = utc.today),
    'weeklyActiveUsers', (select count(distinct a.user_id)::bigint from public.user_activity a, utc where a.activity_date >= utc.today - 6),
    'monthlyActiveUsers', (select count(distinct a.user_id)::bigint from public.user_activity a, utc where a.activity_date >= utc.today - 29),
    'newRegistrationsToday', (select count(*)::bigint from auth.users u, utc where (u.created_at at time zone 'UTC')::date = utc.today),
    'freeUsers', coalesce((select n from plans where tier = 'free'), 0),
    'premiumUsers', coalesce((select n from plans where tier = 'premium'), 0),
    'aiRequests24h', (select count(*)::bigint from public.admin_ai_events where created_at >= now() - interval '24 hours'),
    'aiRequests7d', (select count(*)::bigint from public.admin_ai_events where created_at >= now() - interval '7 days'),
    'aiRequests30d', (select count(*)::bigint from public.admin_ai_events where created_at >= now() - interval '30 days'),
    'aiFailures24h', (select count(*)::bigint from public.admin_ai_events where not succeeded and created_at >= now() - interval '24 hours'),
    'modelUsage', coalesce((select jsonb_agg(jsonb_build_object('provider', provider, 'model', model, 'calls', calls, 'succeeded', succeeded, 'failed', failed)) from model_usage), '[]'::jsonb),
    'recentErrors', coalesce((select jsonb_agg(jsonb_build_object('code', error_code, 'occurrences', occurrences, 'lastSeen', last_seen)) from recent_errors), '[]'::jsonb),
    'registrationsDaily', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'count', count) order by day) from daily_registrations), '[]'::jsonb),
    'registrationsWeekly', coalesce((select jsonb_agg(jsonb_build_object('date', week, 'count', count) order by week) from weekly_registrations), '[]'::jsonb),
    'registrationsMonthly', coalesce((select jsonb_agg(jsonb_build_object('date', month, 'count', count) order by month) from monthly_registrations), '[]'::jsonb),
    'billing', jsonb_build_object('configured', false, 'activeSubscriptions', null, 'revenue', null, 'currency', null),
    'health', jsonb_build_object('database', true, 'checkedAt', now())
  );
$$;

create or replace function public.admin_user_directory(
  p_search text default '', p_status text default 'all', p_tier text default 'all',
  p_page integer default 1, p_page_size integer default 25
)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  with filtered as (
    select u.id as user_id,
      u.email,
      coalesce(nullif(trim(p.display_name), ''), u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '') as display_name,
      u.created_at,
      u.last_sign_in_at,
      case when coalesce(c.account_status, 'active') = 'suspended' or u.banned_until > now() then 'suspended' else 'active' end as account_status,
      coalesce(c.tier, 'free') as tier
    from auth.users u
    left join public.profiles p on p.id = u.id
    left join public.admin_account_control c on c.user_id = u.id
    where (coalesce(p_search, '') = '' or strpos(lower(coalesce(p.display_name, '') || ' ' || coalesce(u.raw_user_meta_data->>'full_name', '') || ' ' || coalesce(u.email, '')), lower(p_search)) > 0)
      and (p_status not in ('active', 'suspended') or
        (p_status = 'active' and coalesce(c.account_status, 'active') <> 'suspended' and (u.banned_until is null or u.banned_until <= now())) or
        (p_status = 'suspended' and (coalesce(c.account_status, 'active') = 'suspended' or u.banned_until > now())))
      and (p_tier not in ('free', 'premium') or coalesce(c.tier, 'free') = p_tier)
  )
  select jsonb_build_object(
    'total', (select count(*)::bigint from filtered),
    'users', coalesce((select jsonb_agg(to_jsonb(page_row) order by page_row.created_at desc)
      from (select * from filtered order by created_at desc limit least(greatest(p_page_size, 1), 100)
        offset greatest(p_page - 1, 0) * least(greatest(p_page_size, 1), 100)) page_row), '[]'::jsonb)
  );
$$;

revoke all on function public.admin_dashboard_summary() from public, anon, authenticated;
revoke all on function public.admin_user_directory(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.admin_dashboard_summary() to service_role;
grant execute on function public.admin_user_directory(text, text, text, integer, integer) to service_role;

-- Admin attempts are rate-limited through the same service-role-only quota RPC.
-- The FOUNDER_ACCESS_CODE and FOUNDER_USER_ID values themselves belong in Supabase Function Secrets only.
-- Extend the accepted internal quota kind; it is still inaccessible to public API roles.
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
  if p_kind is null or p_kind not in ('chat', 'search', 'aux', 'transcribe', 'delete', 'admin_auth') then
    return jsonb_build_object('ok', false, 'reason', 'kind', 'retry_after', 60);
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_kind, 0));
  delete from public.usage_events where user_id = p_user_id and created_at < now() - interval '2 days';
  select count(*), min(created_at) into n_min, oldest from public.usage_events
    where user_id = p_user_id and kind = p_kind and created_at > now() - interval '1 minute';
  if n_min >= per_min then
    return jsonb_build_object('ok', false, 'reason', 'minute', 'retry_after', greatest(1, ceil(extract(epoch from (oldest + interval '1 minute' - now())))::int));
  end if;
  select count(*), min(created_at) into n_day, oldest from public.usage_events
    where user_id = p_user_id and kind = p_kind and created_at > now() - interval '1 day';
  if n_day >= per_day then
    return jsonb_build_object('ok', false, 'reason', 'day', 'retry_after', greatest(1, ceil(extract(epoch from (oldest + interval '1 day' - now())))::int));
  end if;
  if global_day is not null then
    perform pg_advisory_xact_lock(hashtextextended('global:' || p_kind, 0));
    select count(*) into n_all from public.usage_events where kind = p_kind and created_at > now() - interval '1 day';
    if n_all >= global_day then return jsonb_build_object('ok', false, 'reason', 'global', 'retry_after', 300); end if;
  end if;
  insert into public.usage_events (user_id, kind) values (p_user_id, p_kind);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.consume_quota(uuid, text, int, int, int) from public, anon, authenticated;
grant execute on function public.consume_quota(uuid, text, int, int, int) to service_role;


-- Internal helpers: return only the matched account identity, never auth secrets or chat data.
create or replace function public.admin_user_lookup_by_email(p_email text)
returns jsonb
language sql stable security definer
set search_path = pg_catalog, public, auth
as $$
  select jsonb_build_object(
    'user_id', u.id,
    'email', u.email,
    'display_name', coalesce(nullif(trim(p.display_name), ''), u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')
  )
  from auth.users u left join public.profiles p on p.id = u.id
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;
revoke all on function public.admin_user_lookup_by_email(text) from public, anon, authenticated;
grant execute on function public.admin_user_lookup_by_email(text) to service_role;

-- Activity is not sensitive, but suspended accounts must not inflate active-user counts.
drop policy if exists "activity own active" on public.user_activity;
create policy "activity own active" on public.user_activity
  for all using (user_id = auth.uid() and public.current_account_is_active())
  with check (user_id = auth.uid() and public.current_account_is_active());
