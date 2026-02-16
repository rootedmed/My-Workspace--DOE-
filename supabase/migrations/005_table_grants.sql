-- Ensure authenticated users can access app tables (RLS still enforces row ownership).
grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.app_users to authenticated;
grant select, insert, update, delete on table public.onboarding_profiles to authenticated;
grant select, insert, update, delete on table public.user_photos to authenticated;
grant select, insert, update, delete on table public.user_calibrations to authenticated;
grant select, insert, update, delete on table public.decision_tracks to authenticated;
grant select, insert, update, delete on table public.match_results to authenticated;
