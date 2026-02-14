# Research Log

## Web Access Verification (2026-02-14)
- Academic source fetch: `https://pubmed.ncbi.nlm.nih.gov/37998682/` (ECR-G-10 short form) - **Succeeded (live retrieval)**.
- Official docs fetch: `https://nextjs.org/docs/app/guides/authentication` - **Succeeded (live retrieval)**.
- Result: outbound web retrieval available in this environment.

## Phase: Auth (2026-02-14)
### Findings
- Next.js official guidance recommends using an auth library for production security and reducing implementation errors.
- App Router patterns emphasize server-side authorization checks in route handlers and centralized access logic.
### Product implications
- Use a standard session pattern (signed HTTP-only cookie for this repo) with secure password hashing.
- Enforce route-handler checks for onboarding/matches/track APIs.
- Keep account model minimal: email, password hash, createdAt, optional firstName.

## Phase: Onboarding (2026-02-14)
### Findings
- Completion and trust improve with progressive disclosure, clear time expectations, and adaptive depth.
- Non-clinical framing reduces defensiveness and supports honest self-report.
### Product implications
- Add a fast vs deep mode.
- Keep wording calm and concrete ("signals", "tendencies").
- Reveal interpretation only after user opts in and submits.

## Phase: Matching (2026-02-14)
### Findings
- Explainability improves perceived fairness and user trust in recommendation systems.
- Hard filters reduce mismatch fatigue in commitment-oriented contexts.
### Product implications
- Use hard filters first, weighted compatibility second.
- Return top fit reasons and potential friction points with conversation prompts.
- Add calibration input after interactions to gently adjust user-specific weights.

## Phase: UX (2026-02-14)
### Findings
- Retention without manipulation is supported by clarity, bounded flows, and closure-oriented progress.
- Avoiding endless choice loops reduces overload and decision fatigue.
### Product implications
- Limit preview to a small ranked batch.
- Emphasize "next best action" over infinite browse.
- Decision Track should have explicit end states and closure messaging templates.

## Phase: Persistence + Infra (2026-02-14)
### Findings
- Managed Postgres with migrations is the lowest-friction production path for this scope.
- Keeping server-side service-role usage only reduces client exposure risk.
### Product implications
- Use Supabase Postgres tables for users/profiles/calibration/matches/tracks.
- Keep SQL migration files committed and reproducible.
- Keep encrypted local fallback only for offline tests/dev continuity.

## Phase: Onboarding UX Polish (2026-02-14)
### Findings
- iOS-like calm visual hierarchy benefits from reduced chrome, high contrast controls, and subtle motion.
- Inline validation + explicit disabled/loading states improve trust and completion.
### Product implications
- Apply motion-light step transitions.
- Add inline errors and explicit save success messaging.
- Keep language non-clinical and neutral.

## Phase: Matching Explainability + Fairness (2026-02-14)
### Findings
- Trust improves when users see both strengths and potential friction points.
- Calibration should be bounded and user-initiated to avoid manipulative optimization.
### Product implications
- Persist match explainability output.
- Keep calibration small, transparent, and reversible.
- Preserve hard filters before weighted ranking.
