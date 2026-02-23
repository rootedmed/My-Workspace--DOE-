-- Lucy conversational onboarding session state and message history.

create table if not exists lucy_onboarding_sessions (
  user_id uuid primary key references app_users(id) on delete cascade,
  session_id uuid not null default gen_random_uuid(),
  current_stage text not null default 'opening',
  stage_states jsonb not null default '{}'::jsonb,
  messages jsonb not null default '[]'::jsonb,
  extracted_data jsonb not null default '{}'::jsonb,
  extraction_envelopes jsonb not null default '{}'::jsonb,
  control_flags jsonb not null default '{}'::jsonb,
  off_topic_total int not null default 0 check (off_topic_total >= 0),
  off_topic_consecutive int not null default 0 check (off_topic_consecutive >= 0),
  quick_mode boolean not null default false,
  completed boolean not null default false,
  last_prompt_id text,
  last_user_message_id text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lucy_onboarding_sessions_current_stage_check
    check (
      current_stage in (
        'opening',
        'past_attribution',
        'conflict_speed',
        'support_need',
        'emotional_openness',
        'love_expression',
        'relationship_vision',
        'relational_strengths',
        'growth_intention',
        'closing'
      )
    )
);

create index if not exists idx_lucy_onboarding_sessions_updated_at on lucy_onboarding_sessions(updated_at desc);

alter table if exists lucy_onboarding_sessions enable row level security;

drop policy if exists lucy_onboarding_sessions_select_own on lucy_onboarding_sessions;
create policy lucy_onboarding_sessions_select_own on lucy_onboarding_sessions
for select to authenticated
using (user_id = auth.uid());

drop policy if exists lucy_onboarding_sessions_insert_own on lucy_onboarding_sessions;
create policy lucy_onboarding_sessions_insert_own on lucy_onboarding_sessions
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists lucy_onboarding_sessions_update_own on lucy_onboarding_sessions;
create policy lucy_onboarding_sessions_update_own on lucy_onboarding_sessions
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists lucy_onboarding_sessions_delete_own on lucy_onboarding_sessions;
create policy lucy_onboarding_sessions_delete_own on lucy_onboarding_sessions
for delete to authenticated
using (user_id = auth.uid());

grant select, insert, update, delete on table public.lucy_onboarding_sessions to authenticated;
