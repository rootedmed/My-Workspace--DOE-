# Phase 2 Contract Freeze (Chunk 1)

This document is the source of truth for implementing `OnBoard_PHASE2.md` against the current codebase.
It captures existing contracts and the adaptation rules required to avoid regressions.

## Scope

- Date frozen: 2026-02-17
- App stack: Next.js App Router + Supabase (RLS)
- Goal: implement Phase 2 features incrementally without breaking current onboarding, discover, matches, and chat flows.

## Current Canonical Entities

- Users table: `app_users`
- Onboarding profile table: `onboarding_profiles`
- Draft/progress tables: `onboarding_drafts`, `onboarding_progress`
- Swipe + match tables: `profile_swipes`, `mutual_matches`
- Chat table: `match_messages`
- Photos table: `user_photos`

Important: the Phase 2 spec examples reference `users`, `user_profiles`, and `matches`. In this repo, equivalent entities are `app_users`, `onboarding_profiles`, and `mutual_matches`.

## Existing Onboarding Contract

Client:
- `app/onboarding/OnboardingFlow.tsx`
- Current total steps: `8`
- Current answer keys:
  - `past_attribution`
  - `conflict_speed`
  - `love_expression`
  - `support_need`
  - `emotional_openness`
  - `relationship_vision`
  - `relational_strengths`
  - `growth_intention`

APIs:
- `GET /api/onboarding/progress` -> `{ progress, draft }`
- `POST /api/onboarding/answer` -> saves one answer + advances step
- `POST /api/onboarding/complete` -> validates full payload and writes:
  - `onboarding_profiles.compatibility_profile`
  - `onboarding_profiles.attachment_axis`
  - `onboarding_profiles.readiness_score`
  - `onboarding_profiles.completed_at`
  - plus derived `intent`, `tendencies`, `personality`
- `GET /api/onboarding/profile` -> returns compatibility summary fields

Persistence details:
- Draft answers are stored in `onboarding_drafts.answers` JSONB.
- Progress stored in `onboarding_progress`.
- Completed profile persists into `onboarding_profiles`.

## Existing Match + Chat Contract

Discover:
- `GET /api/discover` returns candidates with:
  - `id`, `firstName`, `ageRange`, `locationPreference`, `photoUrl`
  - `compatibilityHighlight`, `watchForInsight`, `likedYou`
- `POST /api/discover` records swipe (`like`/`pass`) and creates `mutual_matches` on reciprocal likes.

Matches:
- `GET /api/matches/list` returns list from `mutual_matches`.
- `GET /api/matches/[matchId]/messages` returns match summary + chat messages.
- `POST /api/matches/[matchId]/messages` inserts into `match_messages`.

Scoring:
- Core scoring: `lib/matching/compatibility.ts`
- Existing components: `intent`, `lifestyle`, `attachment`, `conflictRegulation`, `personality`, `novelty`
- Existing explainability output is already present:
  - `topFitReasons`
  - `potentialFrictionPoints`
  - `conversationPrompts`
- Existing calibration endpoint:
  - `POST /api/matches/calibration`
  - persisted through `db.saveCalibration`

## Existing Results Contract

- UI: `app/results/page.tsx`
- Source: `getOnboardingV2State` (`lib/onboarding/v2.ts`)
- Requires populated `onboarding_profiles.compatibility_profile`
- Current output is card-based summary + CTA to `/discover`

## DB Baseline for New Work

Already present migrations relevant to Phase 2:
- `supabase/migrations/006_core_flow.sql`
- `supabase/migrations/008_swipes_and_mutual_matches.sql`
- `supabase/migrations/010_match_messages_chat.sql`
- `supabase/migrations/011_onboarding_v2_cutover.sql`

All new Phase 2/3 data must be additive migrations and keep RLS + grants consistent with existing style.

## Adaptation Rules from `OnBoard_PHASE2.md`

1. Keep current table vocabulary
- Use `app_users`, `onboarding_profiles`, `mutual_matches`.
- Do not introduce parallel duplicate identity tables.

2. Avoid hard rewrites of current scoring contract
- Extend `scoreCompatibility` in a backward-compatible way.
- Keep existing component score fields intact for UI compatibility.

3. Preserve current onboarding payload shape while adding Q9
- Q9 must be additive (`lifestyle_energy`) and optional-safe during rollout.
- Existing users/profiles without Q9 must still score and render normally.

4. Keep feature behavior non-blocking
- Outcome tracking writes should never block core swipe/chat interactions.
- Learning layer should no-op when sample size is below threshold.

5. Keep API responses additive
- Add new fields without removing existing fields consumed by frontend components.

## Implementation Sequence Lock (for next chunks)

1. Phase 1 quick wins:
- Results screen redesign (shareable)
- Q9 end-to-end field support
- Prompt copy refresh + onboarding live preview
- Incompatibility coaching report payload + UI

2. Phase 2 learning:
- Match outcome storage + automatic event hooks
- Prompted outcome collection
- Revealed preference computation + persistence
- Weight adaptation + user tuning controls

3. Phase 3 moat:
- Relationship check-ins
- Guest compatibility sessions
- Redacted shareable compatibility snapshots

## Regression Gates Per Chunk

- Gate A: `tests/onboarding-v2-flow.test.tsx`
- Gate B: `tests/results-page.test.tsx`
- Gate C: discover/matches/chat route tests as modified
- Gate D: migration tests for new tables/RLS where added

No chunk proceeds until its impacted tests pass.
