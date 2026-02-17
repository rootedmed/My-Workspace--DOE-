-- Phase 2 schema additions:
-- - user_profiles compatibility schema (Section 4 + optional lifestyle_energy)
-- - match_outcomes, revealed_preferences, user_match_weights,
--   relationship_checkins, guest_compatibility_sessions, shared_snapshots
--
-- Note: this migration only adds new tables/indexes and does not alter existing tables.

create extension if not exists pgcrypto;

create table if not exists user_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  past_attribution text not null check (
    past_attribution in ('misaligned_goals', 'conflict_comm', 'emotional_disconnect', 'autonomy', 'external')
  ),
  conflict_speed int not null check (conflict_speed between 1 and 5),
  love_expression text[] not null check (
    cardinality(love_expression) <= 2
    and love_expression <@ array['acts', 'time', 'words', 'physical', 'gifts']::text[]
  ),
  support_need text not null check (
    support_need in ('validation', 'practical', 'presence', 'space', 'distraction')
  ),
  emotional_openness int not null check (emotional_openness between 1 and 5),
  relationship_vision text not null check (
    relationship_vision in ('independent', 'enmeshed', 'friendship', 'safe', 'adventure')
  ),
  relational_strengths text[] not null check (
    cardinality(relational_strengths) <= 2
    and relational_strengths <@ array['consistency', 'loyalty', 'honesty', 'joy', 'support']::text[]
  ),
  growth_intention text not null check (
    growth_intention in ('depth', 'balance', 'chosen', 'peace', 'alignment')
  ),
  attachment_axis text not null check (
    attachment_axis in ('secure', 'anxious_lean', 'avoidant_lean', 'anxious', 'avoidant')
  ),
  readiness_score int not null check (readiness_score between 0 and 100),
  completed_at timestamptz not null,
  lifestyle_energy text check (
    lifestyle_energy in ('introspective', 'high_energy', 'social', 'intellectual', 'spontaneous')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists match_outcomes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid,
  user_id uuid not null references public.users(id) on delete cascade,
  matched_user_id uuid not null references public.users(id) on delete cascade,
  compatibility_score int check (compatibility_score between 0 and 100),
  did_view boolean not null default false,
  viewed_at timestamptz,
  did_message boolean not null default false,
  messaged_at timestamptz,
  did_reply boolean not null default false,
  replied_at timestamptz,
  conversation_length int not null default 0 check (conversation_length >= 0),
  did_go_on_date boolean,
  date_reported_at timestamptz,
  relationship_status text,
  status_reported_at timestamptz,
  user_feedback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_id <> matched_user_id)
);

create table if not exists revealed_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  learned_weights jsonb,
  stated_vs_revealed jsonb,
  sample_size int not null default 0 check (sample_size >= 0),
  last_updated timestamptz not null default now()
);

create table if not exists user_match_weights (
  user_id uuid primary key references public.users(id) on delete cascade,
  weights jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists relationship_checkins (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.users(id) on delete cascade,
  user_b_id uuid not null references public.users(id) on delete cascade,
  month_number int not null check (month_number >= 1),
  user_a_responses jsonb,
  user_a_submitted_at timestamptz,
  user_b_responses jsonb,
  user_b_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  check (user_a_id <> user_b_id)
);

create table if not exists guest_compatibility_sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references public.users(id) on delete cascade,
  guest_token text not null unique,
  guest_answers jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  was_viewed boolean not null default false,
  viewed_at timestamptz,
  guest_converted boolean not null default false
);

create table if not exists shared_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_user_id uuid references public.users(id) on delete set null,
  token text not null unique,
  snapshot_data jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  views int not null default 0 check (views >= 0)
);

-- Indexes
create index if not exists idx_user_profiles_completed_at
  on user_profiles(completed_at desc);

create index if not exists idx_match_outcomes_user
  on match_outcomes(user_id, created_at desc);
create index if not exists idx_match_outcomes_match
  on match_outcomes(match_id);
create index if not exists idx_match_outcomes_matched_user
  on match_outcomes(matched_user_id, created_at desc);

create index if not exists idx_relationship_checkins_user_a
  on relationship_checkins(user_a_id, month_number desc);
create index if not exists idx_relationship_checkins_user_b
  on relationship_checkins(user_b_id, month_number desc);
create unique index if not exists uq_relationship_checkins_pair_month
  on relationship_checkins(
    least(user_a_id::text, user_b_id::text),
    greatest(user_a_id::text, user_b_id::text),
    month_number
  );

create index if not exists idx_guest_sessions_host_user
  on guest_compatibility_sessions(host_user_id, created_at desc);
create index if not exists idx_guest_sessions_token
  on guest_compatibility_sessions(guest_token);

create index if not exists idx_shared_snapshots_user
  on shared_snapshots(user_id, created_at desc);
create index if not exists idx_shared_snapshots_match_user
  on shared_snapshots(match_user_id, created_at desc);
create index if not exists idx_snapshots_token
  on shared_snapshots(token);
