-- Basic 1:1 chat messages for mutual matches.
create table if not exists match_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references mutual_matches(id) on delete cascade,
  sender_id uuid not null references app_users(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists idx_match_messages_match_created
  on match_messages(match_id, created_at asc);

alter table if exists match_messages enable row level security;

drop policy if exists match_messages_select_member on match_messages;
create policy match_messages_select_member on match_messages
for select to authenticated
using (
  exists (
    select 1
    from mutual_matches m
    where m.id = match_messages.match_id
      and (m.user_low = auth.uid() or m.user_high = auth.uid())
  )
);

drop policy if exists match_messages_insert_member on match_messages;
create policy match_messages_insert_member on match_messages
for insert to authenticated
with check (
  sender_id = auth.uid()
  and exists (
    select 1
    from mutual_matches m
    where m.id = match_messages.match_id
      and (m.user_low = auth.uid() or m.user_high = auth.uid())
  )
);

grant select, insert on table public.match_messages to authenticated;
