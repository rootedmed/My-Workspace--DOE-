-- Allow authenticated users to view profile photos via signed URLs in Discover/Matches.
drop policy if exists profile_photos_select_own on storage.objects;
drop policy if exists profile_photos_select_authenticated on storage.objects;
create policy profile_photos_select_authenticated on storage.objects
for select to authenticated
using (bucket_id = 'profile-photos');
