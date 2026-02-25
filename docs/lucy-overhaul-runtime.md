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

Payload includes provider/extraction health plus minimal guard quality fields:

1. `extraction_phase`
2. `provider_used`
3. `gemini_status`
4. `gemini_http_status`
5. `gemini_finish_reason`
6. `gemini_block_reason`
7. `gemini_error_code`
8. `guard_reason`
9. `robotic_pattern_hit`
10. `pre_guard_repeat_type_hit`

## Prompt-First Runtime

Free-chat prompt context is intentionally minimal:

1. transcript window
2. latest user message
3. one short runtime instruction

No runtime confidence matrix, dialogue-act policy block, or phase metadata is injected into the Gemini prompt.

## `no_history` Semantics

`past_attribution` supports additive value:

`no_history`

Behavior:

1. Extract when users say they have never had a relationship.
2. Treat as neutral in compatibility heuristics (no bonus/penalty).
3. Block repeat past-breakup questioning once this value is known; pivot to another uncovered dimension.

## Phase 2 Cleanup Plan

After one stable release window:

1. remove conversational engine files and tests
2. remove conversational env/branching controls
3. deprecate onboarding A/B variant runtime plumbing not needed for free-chat-only flow
