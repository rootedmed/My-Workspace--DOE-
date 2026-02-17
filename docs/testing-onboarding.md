# Testing Plan: Onboarding Determinism

## Scope
Validate onboarding only:
- deterministic step progression
- progress persistence and resume
- completion routing to Results
- dev reset behavior

No Discover/Matches/Chat behavior changes are validated in this plan.

## Preconditions
- User can sign in.
- User is on `/app`.
- Dev reset is available in non-production or with `?dev=1`.

## Test Cases

1. Fresh user starts at first question
- Steps:
  1. Create/sign in as a new user.
  2. Open onboarding.
- Expected:
  1. Starts at question 1 of 7.
  2. `Next` is disabled until an option is selected.

2. Explicit Next is required (no auto-advance)
- Steps:
  1. On any question, change selection multiple times.
  2. Do not press `Next`.
- Expected:
  1. Question does not change.
  2. Step index remains stable.

3. Spam-click Next does not skip
- Steps:
  1. Select an answer.
  2. Rapidly click `Next` multiple times.
- Expected:
  1. Advances exactly one step.
  2. No skipped questions.
  3. If a conflict occurs, an error is shown and flow remains deterministic.

4. Previous updates persisted position
- Steps:
  1. Advance to question 3.
  2. Click `Previous`.
  3. Reload page.
- Expected:
  1. Resumes at question 2.

5. Logout/login resumes exact saved step
- Steps:
  1. Answer up to question 4 and click `Next`.
  2. Sign out.
  3. Sign back in.
- Expected:
  1. Onboarding resumes at question 5 exactly.
  2. Previously selected answers are still shown.

6. Completion routes to Results
- Steps:
  1. Complete all 7 questions.
  2. Click `See results`.
- Expected:
  1. Onboarding saves successfully.
  2. Results screen appears with summary text.

7. Me tab review/edit access
- Steps:
  1. Open `Me` tab.
  2. Review `Analysis answers` section.
  3. Click `Edit Dating Style Analysis`.
- Expected:
  1. All seven category answers are visible.
  2. User can return to onboarding and update answers.

8. Dev reset onboarding
- Steps:
  1. In `Me`, click `Reset onboarding (dev)`.
  2. Return to home.
- Expected:
  1. Onboarding state is cleared.
  2. Flow returns to question 1.

## Automated Coverage
- `tests/onboarding-flow.test.tsx`
  - verifies submit -> `/api/onboarding/complete`
  - verifies completion shows Results screen
  - verifies spam-click does not trigger multiple step saves
