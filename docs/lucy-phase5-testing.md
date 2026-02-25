# Lucy Phase 5 Testing and Iteration

This document operationalizes the Lucy Phase 5 plan in code and runbooks.

## Conversation quality suite

1. Harness: `lib/onboarding/lucy/eval.ts`
2. Scenario set: `lib/onboarding/lucy/evalScenarios.ts`
3. Test entrypoint: `tests/lucy-conversation-eval.test.ts`
4. Default engine baseline: `free_chat` (conversational is comparison-only)

The suite replays 20 deterministic scenarios and scores:

1. `felt_understood`
2. `naturalness`
3. `non_robotic_transitions`
4. `boundary_handling`
5. `completion_likelihood`

## Extraction accuracy suite

1. Metric engine: `lib/onboarding/lucy/extractionAccuracy.ts`
2. Sample annotations: `tests/fixtures/lucy-extraction-samples.ts`
3. Test entrypoint: `tests/lucy-extraction-accuracy.test.ts`

Core checks:

1. field-level accuracy per required dimension
2. macro accuracy
3. over/under inference rates
4. failure clustering buckets

## A/B instrumentation

1. Variant assignment: `lib/onboarding/lucy/experiments.ts`
2. Variant persisted in `control_flags.experiment_variant`
3. Message route emits structured telemetry events with:
   - `variant`
   - `turn_number`
   - `stage_or_thread`
   - `session_id`
   - `model_version`
   - `prompt_version`

## Free Chat Gate Command

Required release gate:

1. `npm run typecheck`
2. `npm run test:lucy:gate`

## Event schema now emitted

1. `lucy_response_generated`
2. `lucy_signal_extracted`
3. `lucy_confirmation_asked`
4. `lucy_gap_fill_started`
5. `lucy_synthesis_shown`
6. `lucy_quick_mode_offered`
7. `lucy_quick_mode_accepted`
8. `lucy_safety_triggered`

## Dashboard tiles (required)

1. conversation starts
2. completion rate
3. median time to complete
4. drop-off by turn index
5. drop-off by thread/stage
6. avg confidently extracted fields before gap-fill
7. clarification turns per conversation
8. quick-mode switch rate
9. safety flag rate
10. contradiction flag rate
11. avg confidence by field
12. cost per completed onboarding
13. variant split and lift
