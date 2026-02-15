-- Move user photos from inline base64 payload to storage object paths.
alter table if exists user_photos
  add column if not exists storage_path text;

update user_photos
set storage_path = concat(user_id::text, '/legacy-', id::text, '.bin')
where storage_path is null;

alter table if exists user_photos
  alter column storage_path set not null;

-- Keep legacy column for backward compatibility, but allow null for new storage-backed rows.
alter table if exists user_photos
  alter column image_base64 drop not null;

-- Dedicated private bucket for profile photos.
insert into storage.buckets (id, name, public, file_size_limit)
values ('profile-photos', 'profile-photos', false, 5242880)
on conflict (id) do nothing;

-- Storage policies: authenticated users can only read/write their own folder.
drop policy if exists profile_photos_select_own on storage.objects;
create policy profile_photos_select_own on storage.objects
for select to authenticated
using (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists profile_photos_insert_own on storage.objects;
create policy profile_photos_insert_own on storage.objects
for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists profile_photos_update_own on storage.objects;
create policy profile_photos_update_own on storage.objects
for update to authenticated
using (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists profile_photos_delete_own on storage.objects;
create policy profile_photos_delete_own on storage.objects
for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and split_part(name, '/', 1) = auth.uid()::text
);
