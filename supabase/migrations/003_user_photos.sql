create table if not exists user_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  slot int not null check (slot between 1 and 6),
  mime_type text not null check (mime_type like 'image/%'),
  image_base64 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, slot)
);

create index if not exists idx_user_photos_user_slot on user_photos(user_id, slot);

alter table if exists user_photos enable row level security;

drop policy if exists user_photos_select_own on user_photos;
create policy user_photos_select_own on user_photos
for select to authenticated
using (user_id = auth.uid());

drop policy if exists user_photos_insert_own on user_photos;
create policy user_photos_insert_own on user_photos
for insert to authenticated
with check (user_id = auth.uid());

drop policy if exists user_photos_update_own on user_photos;
create policy user_photos_update_own on user_photos
for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists user_photos_delete_own on user_photos;
create policy user_photos_delete_own on user_photos
for delete to authenticated
using (user_id = auth.uid());
