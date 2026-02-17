-- Outcome tracking foundation for revealed-preference learning.

create table if not exists match_outcomes (
  match_id uuid not null references mutual_matches(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  matched_user_id uuid not null references app_users(id) on delete cascade,
  compatibility_score int,

  did_view boolean not null default false,
  viewed_at timestamptz,

  did_message boolean not null default false,
  messaged_at timestamptz,

  did_reply boolean not null default false,
  replied_at timestamptz,

  conversation_length int not null default 0 check (conversation_length >= 0),

  did_go_on_date boolean,
  date_reported_at timestamptz,

  relationship_status text check (relationship_status in ('dating', 'exclusive', 'ended', 'married')),
  status_reported_at timestamptz,

  user_feedback jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id),
  check (user_id <> matched_user_id)
);

create index if not exists idx_match_outcomes_user on match_outcomes(user_id, updated_at desc);
create index if not exists idx_match_outcomes_match on match_outcomes(match_id, updated_at desc);

alter table if exists match_outcomes enable row level security;

drop policy if exists match_outcomes_select_own on match_outcomes;
create policy match_outcomes_select_own on match_outcomes
for select to authenticated
using (user_id = auth.uid());

drop policy if exists match_outcomes_insert_own on match_outcomes;
create policy match_outcomes_insert_own on match_outcomes
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists match_outcomes_update_own on match_outcomes;
create policy match_outcomes_update_own on match_outcomes
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on table public.match_outcomes to authenticated;
