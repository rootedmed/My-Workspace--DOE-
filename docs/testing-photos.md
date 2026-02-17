# Photo Pipeline Test Checklist

This checklist validates V1 photo upload and rendering from `/me/photos` into Discover cards.

## Setup

1. Apply DB migrations through `009_profile_photo_discover_read_policy.sql`.
2. Confirm bucket `profile-photos` exists in Supabase Storage.
3. Sign in with two test users (`User A`, `User B`) that both completed onboarding.

## Upload + persistence proof

1. Open `/me/photos` as `User A`.
2. Upload an image in slot 1.
3. In Supabase Storage, verify object exists at:
   `profile-photos/{user_id}/{uuid}.{ext}`
4. In table `public.user_photos`, verify row exists for `user_id = User A` and `slot = 1` with:
   - `storage_path` matching `{user_id}/{uuid}.{ext}`
   - `created_at` populated
   - `updated_at` populated

Expected:
- Upload returns success in UI (`Photo 1 saved.`).
- Storage object and DB row are both present.

## Discover card photo proof

1. Sign in as `User B`.
2. Open `/discover`.
3. Locate `User A` in the swipe stack.

Expected:
- `User A` card shows the uploaded photo (not fallback placeholder).
- Card still shows compatibility highlight and watch-for insight.

## Match list photo proof

1. Create a mutual like between `User A` and `User B`.
2. Open `/matches` for each user.

Expected:
- Match rows include counterpart photo if slot 1 photo exists.
- Name still renders even if no photo exists.

## Regression checks

1. Replace slot 1 photo in `/me/photos`.
2. Refresh `/discover` and `/matches`.

Expected:
- Updated photo appears after refresh.
- No changes to swipe or match creation behavior.
