# V1 Blueprint: Frozen Core Flow

## Scope Lock
Implement only this end-to-end flow:

1. Sign up
2. Dating Style Analysis (onboarding questions)
3. Results
4. Discover (swipe with compatibility insights)
5. Mutual match
6. Chat opens
7. Subtle guided prompts in chat

Explicitly out of scope for V1:

- Pair code creation/join flow
- 14-day decision system
- Nudges/reminders
- Auto-expiration of matches/chats
- Advanced AI behaviors
- Location or advanced filtering logic

## Screens and Routes

### 1) Auth: Sign Up
- Route: `/register`
- Purpose: Create account and start onboarding.
- Shows:
  - Email + password fields
  - Basic profile starter fields (first name)
  - Primary CTA: `Create account`
  - Link to `/login`
- Success path: Redirect to Dating Style Analysis start.

### 2) Auth: Login
- Route: `/login`
- Purpose: Existing users authenticate.
- Shows:
  - Email + password
  - CTA: `Log in`
- Success path:
  - If analysis incomplete: Dating Style Analysis
  - If analysis complete: Discover

### 3) Dating Style Analysis
- Route: `/app/onboarding` (or existing onboarding flow entry under app shell)
- Purpose: Collect required answers to generate compatibility profile.
- Shows:
  - Multi-step question flow
  - Progress indicator
  - Save-and-resume behavior
  - CTA: `Continue` / `Finish analysis`
- Success path: Results screen.

### 4) Analysis Results
- Route: `/app/results`
- Purpose: Show user’s own dating style summary and what drives compatibility.
- Shows:
  - Primary style summary
  - Strengths/fit traits
  - Friction tendencies (lightweight)
  - CTA: `Start discovering`
- Success path: Discover.

### 5) Discover (Swipe + Insights)
- Route: `/app/discover`
- Purpose: Browse candidates and swipe decision.
- Shows:
  - Candidate card stack
  - Compatibility score/summary (short, stable insights)
  - Actions: Pass / Like
  - For V1: all eligible users appear here (no pair code, no advanced filters)
- Success path:
  - On like without mutual: continue swiping
  - On mutual like: create/open match thread and move to Matches/Chat

### 6) Matches List
- Route: `/app/matches`
- Purpose: Show mutual matches and recent conversations.
- Shows:
  - Matched users list
  - Last message preview/time
  - Tap to open chat thread

### 7) Chat Thread
- Route: `/app/chat/[conversationId]`
- Purpose: Real-time or near-real-time messaging with matched user.
- Shows:
  - Message list
  - Composer
  - Subtle guided prompts (optional chips/suggestions, non-blocking)

### 8) Me (Profile & Settings)
- Route: `/app/me`
- Purpose: User-owned data management.
- Shows:
  - Profile summary
  - Entry point to onboarding answers/results refresh
  - Photo management (upload/reorder/delete)
- Notes:
  - Onboarding + photos live under `Me` as editable profile controls after initial completion.

## Bottom Navigation Structure
- `Home`: `/app` (simple status hub, recent activity, quick resume)
- `Discover`: `/app/discover`
- `Matches`: `/app/matches`
- `Me`: `/app/me`

Placement requirements:
- Initial onboarding is entered right after sign-up/login gating.
- Ongoing onboarding edits and photo management live under `Me`.

## Data Needed Per Screen (Tables + Queries)

### `/register`, `/login`
- Tables:
  - `app_users`
- Operations:
  - Insert user on register
  - Auth/session creation on login

### `/app/onboarding`
- Tables:
  - `onboarding_progress`
  - `onboarding_drafts`
  - `onboarding_profiles` (on completion)
  - `user_calibrations` (derived weights, if used)
- Operations:
  - Read current progress for user
  - Upsert draft answers
  - Mark completed and upsert normalized profile/calibration

### `/app/results`
- Tables:
  - `onboarding_profiles`
  - `user_calibrations` (optional for breakdown visualization)
- Operations:
  - Read finalized profile summary for authenticated user

### `/app/discover`
- Tables:
  - `app_users`
  - `onboarding_profiles`
  - `user_photos`
  - `match_results` (compatibility + swipe state)
- Operations:
  - Candidate feed query: all other users with completed onboarding (V1 broad exposure)
  - Attach candidate photo + compatibility insights
  - Record swipe outcome (like/pass)
  - Detect mutual like and create/open conversation

### `/app/matches`
- Tables:
  - `conversations`
  - `messages`
  - `app_users`
- Operations:
  - List conversations for current user
  - Pull counterpart identity and latest message preview

### `/app/chat/[conversationId]`
- Tables:
  - `conversations`
  - `messages`
  - `app_users`
- Operations:
  - Authorize user as conversation participant
  - Fetch ordered messages
  - Insert outbound messages
  - Read/write guided prompt message types (subtle suggestions only)

### `/app/me`
- Tables:
  - `app_users`
  - `onboarding_profiles`
  - `user_photos`
- Operations:
  - Read profile + photo slots
  - Update profile fields allowed in V1
  - Upload/manage photos

## Definition of Done (Layer-by-Layer)

### 1) Product/Flow DoD
- New user can complete: register -> onboarding -> results -> discover -> mutual match -> chat.
- Existing user can login and land in correct state (onboarding or discover).
- Discover shows general user pool (no pair code dependency).
- Guided prompts appear in chat as optional suggestions, not forced workflow.

### 2) Routing/UI DoD
- Routes exist for all screens listed above.
- Bottom nav consistently shows: Home, Discover, Matches, Me.
- Me contains onboarding edit entry + photo management entry.
- Empty/loading/error states exist for Discover, Matches, Chat.

### 3) Data/API DoD
- No required runtime path depends on `pair_codes` or `pair_links`.
- Mutual like reliably results in one conversation per user pair.
- Discover API returns candidates + compatibility insights + photo reference.
- Chat API enforces membership auth and supports send/read.

### 4) Security/RLS DoD
- All profile, matches, and chat queries are user-scoped.
- Users cannot read or write another user’s private onboarding/profile rows directly.
- Conversation/messages access is limited to participants.

### 5) Testing/Quality DoD
- Critical integration tests cover full happy path flow.
- Tests cover mutual match dedupe (single conversation per pair).
- Tests cover unauthorized chat/thread access rejection.
- Regression tests confirm discover feed does not require pair code.

### 6) Scope Guardrails DoD
- No implementation of 14-day decision flow.
- No nudges, expiration jobs, or advanced AI orchestration.
- No advanced filters (location/preferences ranking beyond basic compatibility insights).

## V1 Acceptance Statement
V1 is complete when `register -> onboarding -> results -> discover -> mutual match -> chat with subtle guided prompts` works end-to-end with stable auth, data integrity, and tests, while all out-of-scope systems above remain unimplemented.
