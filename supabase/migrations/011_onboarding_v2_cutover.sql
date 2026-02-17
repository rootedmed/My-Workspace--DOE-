-- Onboarding V2 cutover: add compatibility profile columns and force all users to redo onboarding.

alter table if exists onboarding_profiles
  add column if not exists compatibility_profile jsonb;

alter table if exists onboarding_profiles
  add column if not exists attachment_axis text;

alter table if exists onboarding_profiles
  add column if not exists readiness_score int;

alter table if exists onboarding_profiles
  add column if not exists completed_at timestamptz;

alter table if exists onboarding_profiles
  drop constraint if exists onboarding_profiles_attachment_axis_check;

alter table if exists onboarding_profiles
  add constraint onboarding_profiles_attachment_axis_check
  check (attachment_axis in ('secure', 'anxious_lean', 'avoidant_lean', 'anxious', 'avoidant'));

alter table if exists onboarding_profiles
  drop constraint if exists onboarding_profiles_readiness_score_check;

alter table if exists onboarding_profiles
  add constraint onboarding_profiles_readiness_score_check
  check (readiness_score between 0 and 100);

-- Force all users through the new onboarding flow.
delete from public.match_messages;
delete from public.mutual_matches;
delete from public.profile_swipes;
delete from public.onboarding_profiles;
delete from public.onboarding_drafts;
delete from public.onboarding_progress;
