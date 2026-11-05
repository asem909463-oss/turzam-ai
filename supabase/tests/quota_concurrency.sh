#!/usr/bin/env bash
# Proves that consume_quota (supabase/schema.sql) cannot be pushed past its limits by simultaneous callers.
#
# Needs a PostgreSQL server you can reach with psql (any scratch database, it is dropped afterwards):
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=... bash supabase/tests/quota_concurrency.sh
# Optional: SCHEMA_FILE=path/to/other/schema.sql to test a different version.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
SCHEMA_FILE="${SCHEMA_FILE:-$DIR/../schema.sql}"
DB="turzam_quota_test_$$"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -At)

"${PSQL[@]}" -d postgres -c "create database $DB" >/dev/null
trap '"${PSQL[@]}" -d postgres -c "drop database if exists $DB with (force)" >/dev/null' EXIT
run() { "${PSQL[@]}" -d "$DB" "$@"; }

# Minimal stand-ins for what Supabase provides.
run >/dev/null <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
alter role service_role bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz,
  banned_until timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
create table public.admin_account_control (
  user_id uuid primary key references auth.users(id),
  account_status text not null default 'active'
);
create table public.admin_settings (key text primary key, value jsonb not null);
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
create table public.folders (id uuid primary key, user_id uuid not null references auth.users(id), name text not null);
create table public.projects (id uuid primary key, user_id uuid not null references auth.users(id));
create table public.conversations (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  folder_id uuid references public.folders(id),
  project_id uuid references public.projects(id)
);
-- Stand-ins for tables/objects the Founder Admin section of schema.sql also touches.
create table public.profiles (id uuid primary key references auth.users(id), display_name text);
create table public.messages (id uuid primary key, user_id uuid not null references auth.users(id), conversation_id uuid references public.conversations(id));
create table public.memories (id uuid primary key, user_id uuid not null references auth.users(id));
create table public.project_files (id uuid primary key, user_id uuid not null references auth.users(id), project_id uuid references public.projects(id));
create schema storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
alter table public.folders enable row level security;
alter table public.conversations enable row level security;
SQL

# Seed a legacy cross-user folder reference so the production RLS block's backfill is exercised.
RLS_USER_A="00000000-0000-0000-0000-0000000000a1"
RLS_USER_B="00000000-0000-0000-0000-0000000000b1"
RLS_FOLDER_A="10000000-0000-0000-0000-0000000000a1"
RLS_FOLDER_B="10000000-0000-0000-0000-0000000000b1"
RLS_CHAT="20000000-0000-0000-0000-0000000000a1"
run -c "insert into auth.users values ('$RLS_USER_A'), ('$RLS_USER_B'); insert into public.folders values ('$RLS_FOLDER_A','$RLS_USER_A','A'), ('$RLS_FOLDER_B','$RLS_USER_B','B'); insert into public.conversations values ('$RLS_CHAT','$RLS_USER_A','$RLS_FOLDER_B',null)" >/dev/null

# Apply the legacy conversation/folder blocks first to test the cross-user-link backfill, then apply
# the final helper-backed policies that match the live account-status and feature checks.
sed -n '/^drop policy if exists "conversations own" on public.conversations;/,/^drop policy if exists "messages own" on public.messages;/{ /^drop policy if exists "messages own" on public.messages;/q; p; }' "$SCHEMA_FILE" | run >/dev/null
sed -n '/^drop policy if exists "folders own" on public.folders;/,/^drop policy if exists "projects own" on public.projects;/{ /^drop policy if exists "projects own" on public.projects;/q; p; }' "$SCHEMA_FILE" | run >/dev/null
awk '
  /^drop policy if exists "conversations own" on public.conversations;/ { occurrence++; if (occurrence == 2) in_block = 1 }
  in_block && /^drop policy if exists "messages own" on public.messages;/ { exit }
  in_block { print }
' "$SCHEMA_FILE" | run >/dev/null
awk '
  /^drop policy if exists "folders own" on public.folders;/ { occurrence++; if (occurrence == 2) in_block = 1 }
  in_block && /^drop policy if exists "projects own" on public.projects;/ { exit }
  in_block { print }
' "$SCHEMA_FILE" | run >/dev/null

# Apply the canonical table ACL block rather than granting test-fixture privileges by hand.
sed -n '/^-- Table ACLs are separate from RLS/,/^-- ---------- Row Level Security/ { /^-- ---------- Row Level Security/d; p; }' "$SCHEMA_FILE" | run >/dev/null

# Load quota and recovery-table DDL, excluding the later founder-admin schema and its dependencies.
sed -n '/^-- ---------- Usage limits/,$p' "$SCHEMA_FILE" | sed '/^-- ---------- Founder Admin Panel/,$d' | run >/dev/null
# Apply only the founder-admin quota override, which adds admin_auth, without loading other admin DDL.
sed -n '/^-- Extend the accepted internal quota kind/,/^-- Internal helpers:/{ /^-- Internal helpers:/d; p; }' "$SCHEMA_FILE" | run >/dev/null

fail=0
expect() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "PASS  $1 (allowed $3, expected $2)"; else echo "FAIL  $1 (allowed $3, expected $2)"; fail=1; fi
}

echo "-- application table ACLs and row policies both support normal signed-in use"
core_grants=$(run -c "select concat(bool_and(has_table_privilege('authenticated', c.oid, 'SELECT') and has_table_privilege('authenticated', c.oid, 'INSERT') and has_table_privilege('authenticated', c.oid, 'UPDATE') and has_table_privilege('authenticated', c.oid, 'DELETE')), '|', bool_and(has_table_privilege('service_role', c.oid, 'SELECT') and has_table_privilege('service_role', c.oid, 'INSERT') and has_table_privilege('service_role', c.oid, 'UPDATE') and has_table_privilege('service_role', c.oid, 'DELETE')), '|', bool_and(not has_table_privilege('anon', c.oid, 'SELECT') and not has_table_privilege('anon', c.oid, 'INSERT') and not has_table_privilege('anon', c.oid, 'UPDATE') and not has_table_privilege('anon', c.oid, 'DELETE') and not has_table_privilege('anon', c.oid, 'TRUNCATE') and not has_table_privilege('anon', c.oid, 'TRIGGER'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','conversations','messages','memories','folders','projects','project_files')")
expect "authenticated CRUD and trusted service access, with anon denied" "t|t|t" "$core_grants"
usage_grants=$(run -c "select concat(has_table_privilege('service_role','public.usage_events','SELECT'),'|',has_table_privilege('authenticated','public.usage_events','SELECT'),'|',has_table_privilege('anon','public.usage_events','SELECT'))")
expect "only the trusted server role can read usage analytics" "t|f|f" "$usage_grants"

echo "-- conversation folder links stay within the authenticated user's ownership"
repaired=$(run -c "select coalesce(folder_id::text,'null') from public.conversations where id='$RLS_CHAT'")
expect "legacy cross-user folder links are cleared" "null" "$repaired"
RLS_OWN_CHAT="20000000-0000-0000-0000-0000000000a2"
if run -c "set role authenticated; select set_config('request.jwt.claim.sub','$RLS_USER_A',false); insert into public.conversations values ('$RLS_OWN_CHAT','$RLS_USER_A','$RLS_FOLDER_B',null)" >/dev/null 2>&1; then
  echo "FAIL  user A cannot attach user B's folder (insert unexpectedly succeeded)"
  fail=1
else
  echo "PASS  user A cannot attach user B's folder"
fi
run -c "set role authenticated; select set_config('request.jwt.claim.sub','$RLS_USER_A',false); insert into public.conversations values ('$RLS_OWN_CHAT','$RLS_USER_A','$RLS_FOLDER_A',null)" >/dev/null
visible_to_b=$(run -c "set role authenticated; select set_config('request.jwt.claim.sub','$RLS_USER_B',false); select count(*) from public.conversations where id='$RLS_OWN_CHAT'" | tail -1)
expect "another user cannot read the conversation" "0" "$visible_to_b"

echo "-- ordinary API roles cannot execute or manipulate the quota RPC"
TEST_UID="00000000-0000-0000-0000-0000000000bb"
run -c "insert into auth.users values ('$TEST_UID') on conflict do nothing" >/dev/null
privileges=$(run -c "select concat(has_function_privilege('service_role','public.consume_quota(uuid,text,integer,integer,integer)','EXECUTE'),'|',has_function_privilege('authenticated','public.consume_quota(uuid,text,integer,integer,integer)','EXECUTE'),'|',has_function_privilege('anon','public.consume_quota(uuid,text,integer,integer,integer)','EXECUTE'))")
expect "only the trusted Edge Function role can execute the RPC" "t|f|f" "$privileges"
before=$(run -c "select count(*) from public.usage_events")
for role in anon authenticated; do
  if run -c "set role $role; select public.consume_quota('$TEST_UID','chat',120,5000,1)" >/dev/null 2>&1; then
    echo "FAIL  $role cannot invoke consume_quota (call unexpectedly succeeded)"
    fail=1
  else
    echo "PASS  $role cannot invoke consume_quota"
  fi
done
after=$(run -c "select count(*) from public.usage_events")
expect "denied direct calls cannot write usage records" "$before" "$after"

echo "-- account deletion recovery state survives failures but stays server-only"
deletion_privileges=$(run -c "select concat(has_table_privilege('service_role','public.account_deletion_jobs','SELECT'),'|',has_table_privilege('service_role','public.account_deletion_jobs','INSERT'),'|',has_table_privilege('service_role','public.account_deletion_jobs','UPDATE'),'|',has_table_privilege('service_role','public.account_deletion_jobs','DELETE'),'|',has_table_privilege('authenticated','public.account_deletion_jobs','SELECT'),'|',has_table_privilege('authenticated','public.account_deletion_jobs','INSERT'),'|',has_table_privilege('anon','public.account_deletion_jobs','SELECT'),'|',has_table_privilege('anon','public.account_deletion_jobs','INSERT'))")
expect "only trusted server role has recovery-table access" "t|t|t|t|f|f|f|f" "$deletion_privileges"
deny_policy=$(run -c "select count(*) from pg_policies where schemaname='public' and tablename='account_deletion_jobs' and policyname='deny client access' and cmd='ALL' and roles @> array['anon'::name,'authenticated'::name] and qual='false' and with_check='false'")
expect "account deletion retry state has explicit deny-only client RLS" "1" "$deny_policy"
for role in anon authenticated; do
  if run -c "set role $role; select count(*) from public.account_deletion_jobs" >/dev/null 2>&1; then
    echo "FAIL  $role cannot read deletion recovery state (query unexpectedly succeeded)"
    fail=1
  else
    echo "PASS  $role cannot read deletion recovery state"
  fi
done
run -c "set role service_role; insert into public.account_deletion_jobs(user_id,stage,last_error) values ('$TEST_UID','database','auth_delete_failed') on conflict (user_id) do update set stage='database',last_error='auth_delete_failed';" >/dev/null
pending=$(run -c "select stage || '|' || last_error from public.account_deletion_jobs where user_id='$TEST_UID'")
expect "failed database deletion remains recorded for retry" "database|auth_delete_failed" "$pending"
still_active=$(run -c "select exists(select 1 from auth.users where id='$TEST_UID')")
expect "failed cleanup leaves the account available for recovery" "t" "$still_active"
run -c "set role service_role; update public.account_deletion_jobs set stage='storage',last_error=null,updated_at=now() where user_id='$TEST_UID'" >/dev/null
retry_stage=$(run -c "select stage || '|' || coalesce(last_error,'clear') from public.account_deletion_jobs where user_id='$TEST_UID'")
expect "a retry can resume the pending deletion cleanly" "storage|clear" "$retry_stage"
run -c "set role service_role; delete from public.account_deletion_jobs where user_id='$TEST_UID'" >/dev/null

# Concurrent callers: every caller connects first and then waits at a "starting gate" (an advisory lock held
# by a helper session). When all of them are waiting the gate opens, so they hit consume_quota at the same instant.
#   burst N distinct|same KIND PER_MIN PER_DAY GLOBAL   -> prints how many calls were allowed
GATE=777001
burst() {
  local n=$1 who=$2 kind=$3 per_min=$4 per_day=$5 global=$6
  local shared="00000000-0000-0000-0000-000000000001"
  uid_for() { if [ "$who" = distinct ]; then printf '00000000-0000-0000-0000-%012d' "$1"; else echo "$shared"; fi; }
  run -c "truncate public.usage_events; truncate auth.users cascade" >/dev/null 2>&1
  for i in $(seq 1 "$n"); do echo "insert into auth.users values ('$(uid_for "$i")') on conflict do nothing;"; done | run >/dev/null

  # close the gate
  PGAPPNAME=gate psql -X -q -At -d "$DB" -c "select pg_advisory_lock($GATE); select pg_sleep(300)" >/dev/null 2>&1 &
  until [ "$(run -c "select count(*) from pg_locks where locktype='advisory' and objid=$GATE and granted")" = 1 ]; do sleep 0.05; done

  local out; out="$(mktemp)"
  for i in $(seq 1 "$n"); do
    (
      run -c "set role service_role; select pg_advisory_lock_shared($GATE); select (public.consume_quota('$(uid_for "$i")','$kind',$per_min,$per_day,$global)->>'ok')" \
        | tail -1 >> "$out"
    ) &
  done
  # wait until every caller is queued at the gate, then open it
  until [ "$(run -c "select count(*) from pg_locks where locktype='advisory' and objid=$GATE and not granted")" -ge "$n" ]; do sleep 0.05; done
  run -c "select pg_terminate_backend(pid) from pg_stat_activity where application_name='gate'" >/dev/null
  wait
  grep -c '^true$' "$out" || true
  rm -f "$out"
}

echo "-- 60 different users at the same moment, global cap 10 (each user is far below their own limits)"
expect "global cap holds under a burst" 10 "$(burst 60 distinct chat 120 5000 10)"
expect "global cap holds on a second burst" 10 "$(burst 60 distinct chat 120 5000 10)"
echo "-- one user firing 30 requests at once, per-minute limit 5, no global cap"
expect "per-user minute limit holds" 5 "$(burst 30 same chat 5 5000 null)"
echo "-- no global cap set: nobody is throttled"
expect "global cap is off when null" 40 "$(burst 40 distinct chat 120 5000 null)"
echo "-- caps are per action type"
run -c "truncate public.usage_events" >/dev/null
run >/dev/null -c "insert into auth.users values ('00000000-0000-0000-0000-0000000000aa') on conflict do nothing"
r=$(run -c "set role service_role; select (public.consume_quota('00000000-0000-0000-0000-0000000000aa','chat',10,100,1)->>'ok'), (public.consume_quota('00000000-0000-0000-0000-0000000000aa','chat',10,100,1)->>'ok'), (public.consume_quota('00000000-0000-0000-0000-0000000000aa','aux',10,100,1)->>'ok')" | tail -1)
expect "chat capped at 1 but aux still allowed" "true|false|true" "$r"

echo "-- founder-admin sign-in attempts are rate-limited (admin_auth) and unknown kinds are rejected"
run -c "truncate public.usage_events" >/dev/null
r=$(run -c "set role service_role; select string_agg(coalesce(public.consume_quota('00000000-0000-0000-0000-0000000000aa','admin_auth',5,20,null)->>'ok','null'), ',') from generate_series(1,7)" | tail -1)
expect "admin_auth allows 5 attempts per minute, then blocks" "true,true,true,true,true,false,false" "$r"
r=$(run -c "set role service_role; select public.consume_quota('00000000-0000-0000-0000-0000000000aa','not_a_kind',5,20,null)->>'reason'" | tail -1)
expect "unknown quota kind is rejected" "kind" "$r"

[ "$fail" = 0 ] && echo "ALL PASSED" || { echo "SOME FAILED"; exit 1; }
