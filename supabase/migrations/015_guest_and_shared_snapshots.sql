-- Guest compatibility sessions + redacted shared snapshots.

create table if not exists guest_compatibility_sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references app_users(id) on delete cascade,
  host_first_name text,
  host_compatibility_profile jsonb,
  guest_token text not null unique,
  guest_answers jsonb,
  guest_report jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  was_viewed boolean not null default false,
  viewed_at timestamptz,
  guest_converted boolean not null default false
);

create table if not exists shared_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  match_user_id uuid not null references app_users(id) on delete cascade,
  token text not null unique,
  snapshot_data jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  views int not null default 0 check (views >= 0)
);

create index if not exists idx_guest_sessions_host_created on guest_compatibility_sessions(host_user_id, created_at desc);
create index if not exists idx_guest_sessions_token on guest_compatibility_sessions(guest_token);
create index if not exists idx_snapshots_user_created on shared_snapshots(user_id, created_at desc);
create index if not exists idx_snapshots_token on shared_snapshots(token);

alter table if exists guest_compatibility_sessions enable row level security;
alter table if exists shared_snapshots enable row level security;

drop policy if exists guest_sessions_select_host on guest_compatibility_sessions;
create policy guest_sessions_select_host on guest_compatibility_sessions
for select to authenticated
using (host_user_id = auth.uid());

drop policy if exists guest_sessions_insert_host on guest_compatibility_sessions;
create policy guest_sessions_insert_host on guest_compatibility_sessions
for insert to authenticated
with check (host_user_id = auth.uid());

drop policy if exists guest_sessions_update_host on guest_compatibility_sessions;
create policy guest_sessions_update_host on guest_compatibility_sessions
for update to authenticated
using (host_user_id = auth.uid())
with check (host_user_id = auth.uid());

drop policy if exists guest_sessions_select_public on guest_compatibility_sessions;
create policy guest_sessions_select_public on guest_compatibility_sessions
for select to anon
using (expires_at > now());

drop policy if exists guest_sessions_update_public on guest_compatibility_sessions;
create policy guest_sessions_update_public on guest_compatibility_sessions
for update to anon
using (expires_at > now())
with check (expires_at > now());

drop policy if exists snapshots_select_owner on shared_snapshots;
create policy snapshots_select_owner on shared_snapshots
for select to authenticated
using (user_id = auth.uid());

drop policy if exists snapshots_insert_owner on shared_snapshots;
create policy snapshots_insert_owner on shared_snapshots
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists snapshots_update_owner on shared_snapshots;
create policy snapshots_update_owner on shared_snapshots
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists snapshots_delete_owner on shared_snapshots;
create policy snapshots_delete_owner on shared_snapshots
for delete to authenticated
using (user_id = auth.uid());

drop policy if exists snapshots_select_public on shared_snapshots;
create policy snapshots_select_public on shared_snapshots
for select to anon
using (expires_at > now());

grant select, insert, update on table public.guest_compatibility_sessions to authenticated;
grant select, update on table public.guest_compatibility_sessions to anon;
grant select, insert, update, delete on table public.shared_snapshots to authenticated;
grant select on table public.shared_snapshots to anon;
