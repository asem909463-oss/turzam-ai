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
end $$;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
SQL

# Load only the usage-limit section of schema.sql.
sed -n '/^-- ---------- Usage limits/,$p' "$SCHEMA_FILE" | run >/dev/null

fail=0
expect() { # name, expected, actual
  if [ "$2" = "$3" ]; then echo "PASS  $1 (allowed $3, expected $2)"; else echo "FAIL  $1 (allowed $3, expected $2)"; fail=1; fi
}

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
      run -c "set role authenticated; select set_config('request.jwt.claim.sub','$(uid_for "$i")',false); select pg_advisory_lock_shared($GATE); select (public.consume_quota('$kind',$per_min,$per_day,$global)->>'ok')" \
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
r=$(run -c "set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000aa',false); select (public.consume_quota('chat',10,100,1)->>'ok'), (public.consume_quota('chat',10,100,1)->>'ok'), (public.consume_quota('aux',10,100,1)->>'ok')" | tail -1)
expect "chat capped at 1 but aux still allowed" "true|false|true" "$r"

[ "$fail" = 0 ] && echo "ALL PASSED" || { echo "SOME FAILED"; exit 1; }
