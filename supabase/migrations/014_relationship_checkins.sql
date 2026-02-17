-- Relationship growth check-ins for matched pairs.

create table if not exists relationship_checkin_opt_ins (
  match_id uuid not null references mutual_matches(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  opted_in boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table if not exists relationship_checkins (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references mutual_matches(id) on delete cascade,
  user_low uuid not null references app_users(id) on delete cascade,
  user_high uuid not null references app_users(id) on delete cascade,
  month_number int not null check (month_number >= 1),

  user_low_responses jsonb,
  user_low_submitted_at timestamptz,
  user_high_responses jsonb,
  user_high_submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, month_number)
);

create index if not exists idx_relationship_checkins_match on relationship_checkins(match_id, month_number desc);

alter table if exists relationship_checkin_opt_ins enable row level security;
alter table if exists relationship_checkins enable row level security;

drop policy if exists relationship_checkin_opt_ins_select_own on relationship_checkin_opt_ins;
create policy relationship_checkin_opt_ins_select_own on relationship_checkin_opt_ins
for select to authenticated
using (user_id = auth.uid());

drop policy if exists relationship_checkin_opt_ins_upsert_own on relationship_checkin_opt_ins;
create policy relationship_checkin_opt_ins_upsert_own on relationship_checkin_opt_ins
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists relationship_checkin_opt_ins_update_own on relationship_checkin_opt_ins;
create policy relationship_checkin_opt_ins_update_own on relationship_checkin_opt_ins
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists relationship_checkins_select_member on relationship_checkins;
create policy relationship_checkins_select_member on relationship_checkins
for select to authenticated
using (user_low = auth.uid() or user_high = auth.uid());

drop policy if exists relationship_checkins_insert_member on relationship_checkins;
create policy relationship_checkins_insert_member on relationship_checkins
for insert to authenticated
with check (user_low = auth.uid() or user_high = auth.uid());

drop policy if exists relationship_checkins_update_member on relationship_checkins;
create policy relationship_checkins_update_member on relationship_checkins
for update to authenticated
using (user_low = auth.uid() or user_high = auth.uid())
with check (user_low = auth.uid() or user_high = auth.uid());

grant select, insert, update on table public.relationship_checkin_opt_ins to authenticated;
grant select, insert, update on table public.relationship_checkins to authenticated;
