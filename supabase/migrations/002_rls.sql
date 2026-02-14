-- Ensure RLS is enabled everywhere.
alter table if exists app_users enable row level security;
alter table if exists onboarding_profiles enable row level security;
alter table if exists user_calibrations enable row level security;
alter table if exists decision_tracks enable row level security;
alter table if exists match_results enable row level security;

-- Drop legacy broad policies.
drop policy if exists "service role all app_users" on app_users;
drop policy if exists "service role all onboarding_profiles" on onboarding_profiles;
drop policy if exists "service role all user_calibrations" on user_calibrations;
drop policy if exists "service role all decision_tracks" on decision_tracks;
drop policy if exists "service role all match_results" on match_results;

-- app_users: users can only operate on their own row.
drop policy if exists app_users_select_own on app_users;
create policy app_users_select_own on app_users
for select to authenticated
using (id = auth.uid());

drop policy if exists app_users_insert_own on app_users;
create policy app_users_insert_own on app_users
for insert to authenticated
with check (id = auth.uid());

drop policy if exists app_users_update_own on app_users;
create policy app_users_update_own on app_users
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists app_users_delete_own on app_users;
create policy app_users_delete_own on app_users
for delete to authenticated
using (id = auth.uid());

-- onboarding_profiles: users can only operate on their own profile.
drop policy if exists onboarding_profiles_select_own on onboarding_profiles;
create policy onboarding_profiles_select_own on onboarding_profiles
for select to authenticated
using (user_id = auth.uid());

drop policy if exists onboarding_profiles_insert_own on onboarding_profiles;
create policy onboarding_profiles_insert_own on onboarding_profiles
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists onboarding_profiles_update_own on onboarding_profiles;
create policy onboarding_profiles_update_own on onboarding_profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists onboarding_profiles_delete_own on onboarding_profiles;
create policy onboarding_profiles_delete_own on onboarding_profiles
for delete to authenticated
using (user_id = auth.uid());

-- user_calibrations: users can only operate on their own calibration row.
drop policy if exists user_calibrations_select_own on user_calibrations;
create policy user_calibrations_select_own on user_calibrations
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_calibrations_insert_own on user_calibrations;
create policy user_calibrations_insert_own on user_calibrations
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists user_calibrations_update_own on user_calibrations;
create policy user_calibrations_update_own on user_calibrations
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_calibrations_delete_own on user_calibrations;
create policy user_calibrations_delete_own on user_calibrations
for delete to authenticated
using (user_id = auth.uid());

-- decision_tracks: users can only operate on their own tracks.
drop policy if exists decision_tracks_select_own on decision_tracks;
create policy decision_tracks_select_own on decision_tracks
for select to authenticated
using (user_id = auth.uid());

drop policy if exists decision_tracks_insert_own on decision_tracks;
create policy decision_tracks_insert_own on decision_tracks
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists decision_tracks_update_own on decision_tracks;
create policy decision_tracks_update_own on decision_tracks
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists decision_tracks_delete_own on decision_tracks;
create policy decision_tracks_delete_own on decision_tracks
for delete to authenticated
using (user_id = auth.uid());

-- match_results: participants can read, owner can write.
drop policy if exists match_results_select_participant on match_results;
create policy match_results_select_participant on match_results
for select to authenticated
using (user_id = auth.uid() or candidate_id = auth.uid()::text);

drop policy if exists match_results_insert_owner on match_results;
create policy match_results_insert_owner on match_results
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists match_results_update_owner on match_results;
create policy match_results_update_owner on match_results
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists match_results_delete_owner on match_results;
create policy match_results_delete_owner on match_results
for delete to authenticated
using (user_id = auth.uid());
