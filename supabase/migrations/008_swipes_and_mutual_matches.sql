-- Deterministic swipe decisions + mutual matches for V1 Discover.

create table if not exists profile_swipes (
  actor_user_id uuid not null references app_users(id) on delete cascade,
  target_user_id uuid not null references app_users(id) on delete cascade,
  decision text not null check (decision in ('like', 'pass')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (actor_user_id <> target_user_id),
  primary key (actor_user_id, target_user_id)
);

create table if not exists mutual_matches (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references app_users(id) on delete cascade,
  user_high uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_low <> user_high),
  unique (user_low, user_high)
);

create index if not exists idx_profile_swipes_actor on profile_swipes(actor_user_id, decision, updated_at desc);
create index if not exists idx_profile_swipes_target on profile_swipes(target_user_id, decision, updated_at desc);
create index if not exists idx_mutual_matches_low on mutual_matches(user_low, created_at desc);
create index if not exists idx_mutual_matches_high on mutual_matches(user_high, created_at desc);

alter table if exists profile_swipes enable row level security;
alter table if exists mutual_matches enable row level security;

-- Actor can read their own swipes. Target can read incoming likes only.
drop policy if exists profile_swipes_select_actor_or_liked_target on profile_swipes;
create policy profile_swipes_select_actor_or_liked_target on profile_swipes
for select to authenticated
using (
  actor_user_id = auth.uid()
  or (target_user_id = auth.uid() and decision = 'like')
);

drop policy if exists profile_swipes_insert_actor on profile_swipes;
create policy profile_swipes_insert_actor on profile_swipes
for insert to authenticated
with check (actor_user_id = auth.uid());

drop policy if exists profile_swipes_update_actor on profile_swipes;
create policy profile_swipes_update_actor on profile_swipes
for update to authenticated
using (actor_user_id = auth.uid())
with check (actor_user_id = auth.uid());

drop policy if exists profile_swipes_delete_actor on profile_swipes;
create policy profile_swipes_delete_actor on profile_swipes
for delete to authenticated
using (actor_user_id = auth.uid());

-- Both match members can read; either member can insert the mutual row.
drop policy if exists mutual_matches_select_member on mutual_matches;
create policy mutual_matches_select_member on mutual_matches
for select to authenticated
using (user_low = auth.uid() or user_high = auth.uid());

drop policy if exists mutual_matches_insert_member on mutual_matches;
create policy mutual_matches_insert_member on mutual_matches
for insert to authenticated
with check (user_low = auth.uid() or user_high = auth.uid());

-- V1 discover needs read access to profiles + photo metadata from other users.
drop policy if exists onboarding_profiles_select_own on onboarding_profiles;
create policy onboarding_profiles_select_authenticated on onboarding_profiles
for select to authenticated
using (true);

drop policy if exists user_photos_select_own on user_photos;
create policy user_photos_select_authenticated on user_photos
for select to authenticated
using (true);

grant select, insert, update, delete on table public.profile_swipes to authenticated;
grant select, insert on table public.mutual_matches to authenticated;
