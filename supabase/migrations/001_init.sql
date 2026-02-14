-- Base extensions
create extension if not exists pgcrypto;
create extension if not exists citext;

-- Users
create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  first_name text not null check (char_length(first_name) between 2 and 80),
  password_hash text not null,
  salt text not null,
  created_at timestamptz not null default now()
);

-- Existing-data hardening (if table existed with text email)
alter table app_users alter column email type citext using email::citext;
create unique index if not exists uq_app_users_email_ci on app_users (email);

-- Onboarding (one profile per user_id)
create table if not exists onboarding_profiles (
  user_id uuid primary key references app_users(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 2 and 80),
  age_range text not null,
  location_preference text not null,
  intent jsonb not null,
  tendencies jsonb not null,
  personality jsonb not null,
  -- Optional: encrypted raw-answer payload only when strictly required.
  raw_answers_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Calibration (one calibration row per user_id)
create table if not exists user_calibrations (
  user_id uuid primary key references app_users(id) on delete cascade,
  weights jsonb not null,
  updated_at timestamptz not null default now()
);

-- Decision tracks
create table if not exists decision_tracks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  state text not null check (
    state in (
      'not_started',
      'active_intro',
      'active_values',
      'active_stress_test',
      'active_decision',
      'paused',
      'completed'
    )
  ),
  day int not null check (day between 0 and 14),
  reflection_count int not null default 0 check (reflection_count >= 0),
  previous_state text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Expected uniqueness:
-- one non-completed track at a time per user; historical completed tracks allowed.
create unique index if not exists uq_decision_tracks_one_open_per_user
  on decision_tracks(user_id)
  where state <> 'completed';

-- Match results
create table if not exists match_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  candidate_id text not null,
  candidate_first_name text not null,
  total_score int not null check (total_score between 0 and 100),
  hard_filter_pass boolean not null,
  reasons jsonb not null,
  top_fit_reasons jsonb not null,
  potential_friction_points jsonb not null,
  conversation_prompts jsonb not null,
  component_scores jsonb not null,
  created_at timestamptz not null default now()
);

-- Canonical pair columns (A/B and B/A collapse to same pair)
alter table match_results
  add column if not exists pair_user_low text generated always as (least(user_id::text, candidate_id)) stored;
alter table match_results
  add column if not exists pair_user_high text generated always as (greatest(user_id::text, candidate_id)) stored;

-- Existing-data note:
-- If migration fails on unique pair index due to pre-existing duplicates, run this dedupe once:
--   delete from match_results m
--   using (
--     select id
--     from (
--       select id,
--              row_number() over (
--                partition by least(user_id::text, candidate_id), greatest(user_id::text, candidate_id)
--                order by created_at desc, id desc
--              ) as rn
--       from match_results
--     ) ranked
--     where ranked.rn > 1
--   ) d
--   where m.id = d.id;
-- Then re-run this migration.
create unique index if not exists uq_match_results_pair
  on match_results(pair_user_low, pair_user_high);

-- Query-path indexes
create index if not exists idx_onboarding_profiles_user_id on onboarding_profiles(user_id);
create index if not exists idx_user_calibrations_user_id on user_calibrations(user_id);
create index if not exists idx_decision_tracks_user_created on decision_tracks(user_id, created_at desc);
create index if not exists idx_decision_tracks_id on decision_tracks(id);
create index if not exists idx_match_results_pair_created
  on match_results(pair_user_low, pair_user_high, created_at desc);
create index if not exists idx_match_results_created on match_results(created_at desc);
create index if not exists idx_match_results_user_created on match_results(user_id, created_at desc);
