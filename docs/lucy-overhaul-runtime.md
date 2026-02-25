# Lucy Onboarding Runtime

This document tracks the current Lucy onboarding runtime after the Free Chat primary cutover.

## Runtime Selection

Onboarding engine selection is now resolved from a single source of truth in:

`lib/onboarding/lucy/freeMode.ts`

Resolver: `resolveLucyOnboardingEngine()`  
Allowed engines:

1. `free_chat`
2. `legacy`

Conversational engine is not selectable in Phase 1 runtime routing.

## Env Precedence

Resolver precedence is exact and deterministic:

1. `LUCY_ONBOARDING_ENGINE=free_chat|legacy` if set and valid
2. `LUCY_FORCE_LEGACY_ONBOARDING=true` -> `legacy`
3. `LUCY_FREE_CONVO_ENABLED` explicitly set
   - `true` -> `free_chat`
   - `false` -> `legacy`
4. `LUCY_FREE_CONVO_DEV_ENABLED=true` -> `free_chat`
5. default -> `free_chat`

## Route Behavior

### `app/api/onboarding/lucy/message/route.ts`

1. `free_chat` -> always runs `processLucyFreeConversationAction`
2. `legacy` -> runs `processLucyUserMessage`
3. conversational routing branch is removed from runtime decision path

### `app/api/onboarding/lucy/session/route.ts`

Uses the same resolver:

1. `free_chat` -> `enableFreeConversationMode` + `buildLucySessionViewFree`
2. `legacy` -> `buildLucySessionView`

## Telemetry

No HTTP contract changes in Phase 1.  
Primary free runtime event remains:

`lucy_free_turn_processed`

Payload now includes adaptive policy and guard quality fields:

1. `policy_mode`
2. `dialogue_phase`
3. `dialogue_act`
4. `question_required`
5. `low_signal`
6. `high_emotion`
7. `forced_pivot`
8. `topic_id`
9. `topic_turn_count`
10. `guard_reason`
11. `robotic_pattern_hit`
12. `pre_guard_repeat_type_hit`

## Policy Controls

Free chat policy mode is controlled by:

1. `LUCY_FREE_POLICY_MODE=strict|adaptive` (default `adaptive`)
2. `LUCY_FREE_POLICY_ADAPTIVE_PERCENT=0..100` (default `100`)

Adaptive mode uses stable user hashing for rollout.

## Phase 2 Cleanup Plan

After one stable release window:

1. remove conversational engine files and tests
2. remove conversational env/branching controls
3. deprecate onboarding A/B variant runtime plumbing not needed for free-chat-only flow
