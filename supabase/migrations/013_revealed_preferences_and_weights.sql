-- Revealed preferences + user-tunable weighting controls.

create table if not exists revealed_preferences (
  user_id uuid primary key references app_users(id) on delete cascade,
  learned_weights jsonb not null default '{}'::jsonb,
  stated_vs_revealed jsonb not null default '[]'::jsonb,
  sample_size int not null default 0 check (sample_size >= 0),
  last_updated timestamptz not null default now()
);

create table if not exists user_match_weights (
  user_id uuid primary key references app_users(id) on delete cascade,
  weights jsonb not null default '{"attachment":1.0,"conflict":1.0,"vision":1.0,"expression":0.8,"lifestyle":0.5}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table if exists revealed_preferences enable row level security;
alter table if exists user_match_weights enable row level security;

drop policy if exists revealed_preferences_select_own on revealed_preferences;
create policy revealed_preferences_select_own on revealed_preferences
for select to authenticated
using (user_id = auth.uid());

drop policy if exists revealed_preferences_upsert_own on revealed_preferences;
create policy revealed_preferences_upsert_own on revealed_preferences
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists revealed_preferences_update_own on revealed_preferences;
create policy revealed_preferences_update_own on revealed_preferences
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_match_weights_select_own on user_match_weights;
create policy user_match_weights_select_own on user_match_weights
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_match_weights_insert_own on user_match_weights;
create policy user_match_weights_insert_own on user_match_weights
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists user_match_weights_update_own on user_match_weights;
create policy user_match_weights_update_own on user_match_weights
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on table public.revealed_preferences to authenticated;
grant select, insert, update on table public.user_match_weights to authenticated;
