-- User profile setup and completion state.

create table if not exists user_profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  date_of_birth date,
  current_city text,
  gender_identity text,
  interested_in text[] not null default '{}'::text[],
  relationship_intention text,
  sexual_orientation text,
  height_cm int,
  work text,
  education text,
  bio text,
  prompt_answer text,
  distance_km int,
  drinking text,
  smoking text,
  exercise text,
  religion text,
  politics text,
  family_plans text,
  pets text,
  interests jsonb not null default '[]'::jsonb,
  setup_completed boolean not null default false,
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_profiles_relationship_intention_check
    check (
      relationship_intention is null
      or relationship_intention in (
        'marriage_minded',
        'serious_relationship',
        'exploring',
        'casual',
        'unsure'
      )
    ),
  constraint user_profiles_height_cm_check
    check (height_cm is null or (height_cm between 120 and 240)),
  constraint user_profiles_distance_km_check
    check (distance_km is null or (distance_km between 1 and 500)),
  constraint user_profiles_bio_check
    check (bio is null or char_length(bio) <= 280),
  constraint user_profiles_prompt_answer_check
    check (prompt_answer is null or char_length(prompt_answer) <= 280)
);

create index if not exists idx_user_profiles_city on user_profiles(current_city);
create index if not exists idx_user_profiles_intention on user_profiles(relationship_intention);

alter table if exists user_profiles enable row level security;

drop policy if exists user_profiles_select_own on user_profiles;
create policy user_profiles_select_own on user_profiles
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_profiles_insert_own on user_profiles;
create policy user_profiles_insert_own on user_profiles
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists user_profiles_update_own on user_profiles;
create policy user_profiles_update_own on user_profiles
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_profiles_delete_own on user_profiles;
create policy user_profiles_delete_own on user_profiles
for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on table public.user_profiles to authenticated;

alter table if exists user_photos
  add column if not exists display_order int;

update user_photos
set display_order = slot
where display_order is null;

alter table if exists user_photos
  alter column display_order set default 1;

alter table if exists user_photos
  alter column display_order set not null;

alter table if exists user_photos
  drop constraint if exists user_photos_display_order_check;

alter table if exists user_photos
  add constraint user_photos_display_order_check
  check (display_order between 1 and 6);

create index if not exists idx_user_photos_user_display_order on user_photos(user_id, display_order);
