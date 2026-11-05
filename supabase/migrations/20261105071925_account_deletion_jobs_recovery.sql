-- Server-only retry state for the delete-account Edge Function.
-- Intentionally no auth.users FK: a pending recovery record must survive a failed auth deletion/cascade.
create table public.account_deletion_jobs (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  stage text not null default 'storage' check (stage in ('storage', 'database')),
  last_error text
);

comment on table public.account_deletion_jobs is
  'Private retry state for delete-account Edge Function; user_id intentionally has no auth.users foreign key.';

alter table public.account_deletion_jobs enable row level security;
revoke all on public.account_deletion_jobs from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.account_deletion_jobs to service_role;
