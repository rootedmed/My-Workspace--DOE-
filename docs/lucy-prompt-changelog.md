# Lucy Prompt Changelog

All production prompt updates must be logged before rollout.

## Entry Template

1. **Change ID**: `lucy-prompt-YYYYMMDD-XX`
2. **Date**: `YYYY-MM-DD`
3. **Owner**: `name`
4. **Hypothesis**: What behavior/metric should improve?
5. **Diff Summary**: Exact additions/removals (concise).
6. **Affected Scenarios**: IDs from `lib/onboarding/lucy/evalScenarios.ts`.
7. **Expected Metric Movement**:
   - completion
   - felt_understood
   - extraction accuracy
   - safety flag rate
8. **Observed Results (post deploy)**:
   - completion delta
   - naturalness delta
   - macro accuracy delta
   - regressions
9. **Decision**: keep / rollback / iterate

## Log

### `lucy-prompt-20260221-01`

1. **Date**: `2026-02-21`
2. **Owner**: `team`
3. **Hypothesis**: Add Phase 5 event and evaluation scaffolding without behavior regression.
4. **Diff Summary**: Added scenario harness, extraction metrics harness, A/B metadata, and telemetry event schema wiring.
5. **Affected Scenarios**: all 20 baseline scenarios.
6. **Expected Metric Movement**:
   - completion: neutral
   - felt_understood: neutral
   - extraction accuracy: neutral
   - safety flag rate: neutral
7. **Observed Results (post deploy)**: pending.
8. **Decision**: pending.

### `lucy-prompt-20260222-01`

1. **Date**: `2026-02-22`
2. **Owner**: `team`
3. **Hypothesis**: A stricter free-mode prompt plus deterministic reply guard will reduce vague/repeated questions and improve extraction readiness speed.
4. **Diff Summary**: Replaced free chat prompt with concrete turn contract; added prompt context steering and deterministic guard rewrites for vague/repeat/questionless responses; replaced generic fallback with targeted question bank.
5. **Affected Scenarios**: `guarded_short`, `idk_repeated`, `ex_venting_high_frustration`, `depends_everything`.
6. **Expected Metric Movement**:
   - completion: up
   - felt_understood: neutral to up
   - extraction accuracy: up
   - safety flag rate: neutral
7. **Observed Results (post deploy)**: pending.
8. **Decision**: pending.

### `lucy-prompt-20260223-01`

1. **Date**: `2026-02-23`
2. **Owner**: `team`
3. **Hypothesis**: Explicit steering principles plus runtime low-confidence targeting will shorten rambling conversations without robotic tone.
4. **Diff Summary**: Added steering decision tree + "validate quickly / extract then move" principles to free-chat prompt; added per-turn estimated coverage context and preferred next dimension in runtime prompt; added prompt guard to prevent missing-question/repeat-question/vague loops and preserve natural bridge questions.
5. **Affected Scenarios**: `oversharer_detailed`, `tangent_heavy`, `idk_repeated`, `high_trauma_non_crisis`, `balanced_thoughtful`.
6. **Expected Metric Movement**:
   - completion: up
   - felt_understood: neutral to up
   - extraction accuracy: up
   - safety flag rate: neutral
7. **Observed Results (post deploy)**: pending.
8. **Decision**: pending.

### `lucy-prompt-20260223-02`

1. **Date**: `2026-02-23`
2. **Owner**: `team`
3. **Hypothesis**: Replacing free-chat prompt with hard anti-drill rules plus deterministic guard rewrites will stop therapist-style loops and improve completion speed without raising frustration.
4. **Diff Summary**: Replaced free-chat system prompt with emergency forward-motion contract (non-therapeutic, no obvious/banned exploratory prompts, 12-16 exchange pacing, strict dimension priority). Added deterministic outgoing-question sanitizer for banned exploratory patterns, repeated-type prevention, and missing-question auto-bridge rewrite.
5. **Affected Scenarios**: `ex_venting_high_frustration`, `oversharer_detailed`, `idk_repeated`, `tangent_heavy`, `balanced_thoughtful`.
6. **Expected Metric Movement**:
   - completion: up
   - felt_understood: neutral to up
   - extraction accuracy: up
   - safety flag rate: neutral
7. **Observed Results (post deploy)**: pending.
8. **Decision**: pending.

### `lucy-prompt-20260225-01`

1. **Date**: `2026-02-25`
2. **Owner**: `team`
3. **Hypothesis**: Adaptive dialogue-act policy in free chat will reduce robotic opener pivots while preserving forward coverage and anti-drill behavior.
4. **Diff Summary**: Replaced absolute prompt contract with adaptive pacing language; added deterministic policy selection (`opening|middle|closing`, `reflect_only|reflect_then_bridge|clarify_then_bridge|direct_bridge`), low-signal/high-emotion handling, reflect/topic budgets, style normalizer, expanded context window, and guard telemetry.
5. **Affected Scenarios**: `vague_openers`, `ex_venting_high_frustration`, `tangent_heavy`, `balanced_thoughtful`, `brief_answers`.
6. **Expected Metric Movement**:
   - completion: neutral to up
   - felt_understood: up
   - extraction accuracy: neutral to up
   - safety flag rate: neutral
7. **Observed Results (post deploy)**: pending.
8. **Decision**: pending.

### `lucy-prompt-20260225-02`

1. **Date**: `2026-02-25`
2. **Owner**: `team`
3. **Hypothesis**: Prompt-first simplification with minimal deterministic guards will restore natural conversation flow and stop no-history past-loop regressions.
4. **Diff Summary**: Replaced free-chat system prompt with the simplified Lucy prompt from product direction; removed runtime steering metadata injection from chat prompts; reduced guard scope to banned exploratory rewrites + loop breaking + missing-question fallback; added explicit `past_attribution=no_history` extraction and blocked past-breakup follow-up loops when no history is known.
5. **Affected Scenarios**: `vague_openers`, `never_had_relationship`, `idk_repeated`, `ex_venting_high_frustration`.
6. **Expected Metric Movement**:
   - completion: neutral to up
   - felt_understood: up
   - extraction accuracy: neutral to up
   - safety flag rate: neutral
7. **Observed Results (post deploy)**: pending.
8. **Decision**: pending.
