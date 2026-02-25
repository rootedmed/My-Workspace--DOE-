# Lucy Autonomous Testing & Debugging Report

Date: 2026-02-22  
Runner: `tests/lucy-autonomous-protocol.test.ts`  
Latest artifact: `.tmp/lucy-autonomous-latest.json`

Engine note:
- Protocol runner is now engine-aware.
- Default execution mode is `free_chat`.
- `conversational` remains optional for historical comparison only.

## 1) Error Taxonomy (with observed examples)

### Type 1: Extraction failures
1. `s04_avoidant_ex_vent`: partner behavior ("my ex shut down") was initially mapped to user `conflict_speed=5`.
2. `s10_conflict_speed_precision`: nuanced answer ("30 minutes then resolve") drifted to `conflict_speed=3`.
3. `s13_warm_tone_consistency`: "mixed intentions" was overridden by later `conflict_comm`.

### Type 2: Conversation flow breaks
1. Repeated off-topic redirect line in `s07_off_topic_repeated`.
2. Repeated contradiction prompt loop in `s09_hostile_user`.
3. Repeated unresolved-field quick-pick loop in skeptical/guarded flows.

### Type 3: Personality inconsistencies
1. Overuse of "Quick pick is easiest..." created checklist tone.
2. Frequent "Keep this?" phrasing felt transactional.
3. Abrupt forced-choice phrasing after short emotional shares.

### Type 4: Edge case handling issues
1. Clarification question ("3 out of what?") could break pending-confirmation progression.
2. Numeric user replies (e.g. `1`, `2`, `4`) contaminated multiple fields.
3. Hostile/off-topic users could get stuck in rigid clarification cycles.

### Type 5: Data quality issues
1. Past-attribution confidence dropped on novel phrasing ("disappear whenever things got hard").
2. Medium-confidence fields could block completion with repeated prompting.
3. Direct user corrections were ignored when earlier inference had higher confidence.

### Type 6: Technical failures
1. Pending-confirmation state could clear too early under threshold changes.
2. Contradiction prompt lacked one-time keying and could re-fire every turn.
3. Merge precedence favored inferred/high-confidence signals over direct stage-matched responses.

## 2) Scenario Coverage

Full 15-scenario suite is defined in:
- `lib/onboarding/lucy/autonomousScenarios.ts`

Execution and scoring are implemented in:
- `lib/onboarding/lucy/autonomousProtocol.ts`

## 3) Prioritized Issues and Fixes

### Critical (resolved)
1. Contradiction loop re-fire:
   - Fix: one-time contradiction key tracking in `control_flags.contradiction_prompted_keys`.
2. Cross-field numeric contamination:
   - Fix: bare-numeric guard in candidate extraction (`extractCandidates`).
3. Duplicate redirect replies:
   - Fix: anti-loop guard added to off-topic redirect branch.

### High (resolved)
1. Rule/LLM merge precedence:
   - Fix: prefer active-stage stage-match and non-inferred signals within bounded confidence deltas.
2. Direct correction ignored:
   - Fix: allow bounded overwrite for stage-matched direct corrections.
3. Robotic phrasing:
   - Fix: softened confirmation and option phrasing; removed repeated "quick pick" language.

### Medium (resolved)
1. Slang/implicit pattern misses:
   - Fix: expanded implication patterns and extraction keywords.
2. Past-attribution under-capture:
   - Fix: stronger direct/emotional pattern mapping and reduced generic conflict overreach.

## 4) Iteration Log

### Iteration 1 (baseline from protocol run)
- Overall: `4.03`
- Critical issues: extraction mismatches, repeated prompts, technical loops.
- Action: patched numeric guards, contradiction keying, redirect anti-loop, confidence/merge behavior.

### Iteration 2
- Overall: `4.51`
- Status: critical loop issues removed; remaining extraction mismatches and one validation miss.
- Action: improved conflict/openness extraction precedence, emotional wording, correction overwrite logic.

### Iteration 3
- Overall: `4.56`
- Status: prioritized issues reduced to one extraction cluster.
- Action: refined stage-match correction boundaries and implication patterns.

### Iteration 4 (latest)
- Overall: `4.57`
- Prioritized issues: none
- Completion rate: `93.3%`
- Per-dimension accuracy:
  - `past_attribution`: `93.3%`
  - `conflict_speed`: `86.7%`
  - `support_need`: `93.3%`
  - `emotional_openness`: `100%`
  - `love_expression`: `100%`
  - `relationship_vision`: `100%`
  - `relational_strengths`: `100%`
  - `growth_intention`: `100%`

## 5) Files changed in this hardening cycle

- `lib/onboarding/lucy/conversationalEngine.ts`
- `lib/onboarding/lucy/extractors.ts`
- `lib/onboarding/lucy/types.ts`
- `tests/pending_confirmation_guard.test.ts`
- `docs/lucy-autonomous-testing-report.md`

## 6) Current status against done criteria

- Average score >= 4.0 across 15 scenarios: pass (`4.57`)
- Zero critical issues: pass
- <=2 high-priority issues: pass (`0`)
- Extraction accuracy >=85% per dimension: pass
- Completion rate >=14/15 equivalent: pass (`93.3%`)
- Conversation quality mostly natural and non-looping: pass in latest harness run
