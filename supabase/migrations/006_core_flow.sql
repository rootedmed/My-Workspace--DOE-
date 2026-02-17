-- Onboarding deterministic progress + draft answers
create table if not exists onboarding_progress (
  user_id uuid primary key references app_users(id) on delete cascade,
  current_step int not null default 1 check (current_step >= 1),
  completed boolean not null default false,
  total_steps int not null default 3 check (total_steps >= 1),
  mode text not null default 'fast' check (mode in ('fast', 'deep')),
  updated_at timestamptz not null default now()
);

create table if not exists onboarding_drafts (
  user_id uuid primary key references app_users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Conversations + messages + guided decision track state per conversation
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references app_users(id) on delete cascade,
  user_high uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (user_low <> user_high),
  unique(user_low, user_high)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid not null references app_users(id) on delete cascade,
  body text not null,
  type text not null default 'message' check (type in ('message', 'suggested_topic', 'decision_prompt', 'decision_complete', 'system')),
  created_at timestamptz not null default now()
);

create table if not exists conversation_decision_tracks (
  conversation_id uuid primary key references conversations(id) on delete cascade,
  day_number int not null default 1 check (day_number between 1 and 14),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  prompt_id text not null default 'day_1',
  completed_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

-- Photo metadata: storage backed path
alter table if exists user_photos
  add column if not exists storage_path text;

-- Helpful indexes
create index if not exists idx_messages_conversation_created on messages(conversation_id, created_at asc);

-- Enable RLS for new tables
alter table if exists onboarding_progress enable row level security;
alter table if exists onboarding_drafts enable row level security;
alter table if exists conversations enable row level security;
alter table if exists messages enable row level security;
alter table if exists conversation_decision_tracks enable row level security;

-- onboarding_progress policies
 drop policy if exists onboarding_progress_select_own on onboarding_progress;
create policy onboarding_progress_select_own on onboarding_progress
for select to authenticated
using (user_id = auth.uid());

drop policy if exists onboarding_progress_insert_own on onboarding_progress;
create policy onboarding_progress_insert_own on onboarding_progress
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists onboarding_progress_update_own on onboarding_progress;
create policy onboarding_progress_update_own on onboarding_progress
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists onboarding_progress_delete_own on onboarding_progress;
create policy onboarding_progress_delete_own on onboarding_progress
for delete to authenticated
using (user_id = auth.uid());

-- onboarding_drafts policies
 drop policy if exists onboarding_drafts_select_own on onboarding_drafts;
create policy onboarding_drafts_select_own on onboarding_drafts
for select to authenticated
using (user_id = auth.uid());

drop policy if exists onboarding_drafts_insert_own on onboarding_drafts;
create policy onboarding_drafts_insert_own on onboarding_drafts
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists onboarding_drafts_update_own on onboarding_drafts;
create policy onboarding_drafts_update_own on onboarding_drafts
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists onboarding_drafts_delete_own on onboarding_drafts;
create policy onboarding_drafts_delete_own on onboarding_drafts
for delete to authenticated
using (user_id = auth.uid());

-- conversations policies
 drop policy if exists conversations_select_member on conversations;
create policy conversations_select_member on conversations
for select to authenticated
using (user_low = auth.uid() or user_high = auth.uid());

drop policy if exists conversations_insert_member on conversations;
create policy conversations_insert_member on conversations
for insert to authenticated
with check (user_low = auth.uid() or user_high = auth.uid());

drop policy if exists conversations_update_member on conversations;
create policy conversations_update_member on conversations
for update to authenticated
using (user_low = auth.uid() or user_high = auth.uid())
with check (user_low = auth.uid() or user_high = auth.uid());

-- messages policies
 drop policy if exists messages_select_member on messages;
create policy messages_select_member on messages
for select to authenticated
using (
  exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists messages_insert_member on messages;
create policy messages_insert_member on messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from conversations c
    where c.id = messages.conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

-- decision track policies
 drop policy if exists conversation_decision_tracks_select_member on conversation_decision_tracks;
create policy conversation_decision_tracks_select_member on conversation_decision_tracks
for select to authenticated
using (
  exists (
    select 1 from conversations c
    where c.id = conversation_decision_tracks.conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists conversation_decision_tracks_insert_member on conversation_decision_tracks;
create policy conversation_decision_tracks_insert_member on conversation_decision_tracks
for insert to authenticated
with check (
  exists (
    select 1 from conversations c
    where c.id = conversation_decision_tracks.conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

drop policy if exists conversation_decision_tracks_update_member on conversation_decision_tracks;
create policy conversation_decision_tracks_update_member on conversation_decision_tracks
for update to authenticated
using (
  exists (
    select 1 from conversations c
    where c.id = conversation_decision_tracks.conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
)
with check (
  exists (
    select 1 from conversations c
    where c.id = conversation_decision_tracks.conversation_id
      and (c.user_low = auth.uid() or c.user_high = auth.uid())
  )
);

-- Grants for authenticated role
grant select, insert, update, delete on table public.onboarding_progress to authenticated;
grant select, insert, update, delete on table public.onboarding_drafts to authenticated;
grant select, insert, update on table public.conversations to authenticated;
grant select, insert on table public.messages to authenticated;
grant select, insert, update on table public.conversation_decision_tracks to authenticated;
