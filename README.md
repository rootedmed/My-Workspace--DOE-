# Commitment Match MVP

Commitment-oriented dating app MVP with psychologically informed onboarding, compatibility ranking, and a 14-day decision track.

## Recommended Stack

- `Next.js` (App Router) for web UI + API in one deployable service
- `TypeScript` with strict compiler settings
- `Zod` for shared runtime validation
- `Vitest` + `Testing Library` for fast unit/integration tests
- `ESLint` + `Prettier` for quality and consistency

This keeps dependencies small while still supporting a production path.

## Current Scope

- Multi-step onboarding wizard (intent, constraints, tendencies, personality)
- Non-clinical scoring for attachment gradients, conflict repair, emotional regulation, and novelty preference
- Compatibility preview against a mock candidate pool
- 14-day decision-track state machine with phase transitions
- Mock in-memory database layer for profiles + tracks
- Strict TypeScript, linting, formatting, and test suite

## Safety Constraints Applied

- No authentication yet
- No persistence of sensitive user data
- Reflection traits are treated as self-reflection inputs, not diagnosis

## Local Setup

1. Install dependencies:
   - `npm install`
2. Copy env:
   - `cp .env.example .env.local`
3. Run dev server:
   - `npm run dev`
4. Run checks:
   - `npm run check`

## Endpoints

- `GET /api/health` returns service + DB mock status
- `POST /api/onboarding/complete` saves onboarding and returns tendency summary
- `GET /api/matches/preview?userId=...` returns ranked compatibility candidates
- `POST /api/decision-track/start` starts a decision track
- `POST /api/decision-track/advance` advances or updates track state

## Research and Model Docs

- `docs/psychology-foundation.md`
- `docs/matching-model.md`

## Suggested Next Iterations

1. Add authentication and scoped data ownership.
2. Replace mock DB with encrypted persistent storage.
3. Add experiment logging for score calibration and fairness checks.
