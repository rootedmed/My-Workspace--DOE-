# Matching Model (v1)

## Model Objectives
- Commitment-first filtering before compatibility ranking.
- Explainability by default.
- Non-clinical language: tendencies and signals, never diagnosis.

## API Surface (v1)
- `POST /api/onboarding/complete`
- `GET /api/matches/preview`
- `POST /api/matches/calibration`
- `POST /api/decision-track/start`
- `POST /api/decision-track/advance`

All endpoints except `/api/health`, `/api/auth/*` require authenticated session.

## Data Principles
- Store derived scores only for onboarding analysis.
- Do not persist raw questionnaire text.
- Primary persistence in Supabase Postgres; optional raw answers must be encrypted (`raw_answers_encrypted`).

## Hard Filters
A candidate is rejected if either condition is true:
1. `abs(user.timelineMonths - candidate.timelineMonths) > 18`
2. Intent mismatch floor:
   - `marriage_minded` vs `exploring`

## Component Scores
Each component is normalized to `0..100`:
- `intent`
- `lifestyle`
- `attachment`
- `conflictRegulation`
- `personality`
- `novelty`

## Weighted Score
Default weights:
- intent: `0.25`
- lifestyle: `0.20`
- attachment: `0.15`
- conflictRegulation: `0.20`
- personality: `0.15`
- novelty: `0.05`

Formula:
`total = Σ(componentScore_i * weight_i)`

If hard filter fails: `total = 0`.

## Explainability Output
Per match response:
- `topFitReasons`: top 3 high-scoring components
- `potentialFrictionPoints`: lowest 2 components
- `conversationPrompts`: 2 prompts tied to friction points

This allows users to understand both upside and risk.

## Calibration (User-specific learning)
Endpoint: `POST /api/matches/calibration`
Input: `feltRight` (1..5) after interaction.

Behavior:
- Slightly increases/decreases personal weights for intent and conflict/regulation.
- Renormalizes all weights to sum to 1.
- Keeps adjustments small and transparent.

Constraint:
- No hidden optimization for compulsive engagement.
- Calibration only improves fit relevance and user control.

## Decision Track State Machine
States:
- `not_started`
- `active_intro` (day 1-3)
- `active_values` (day 4-7)
- `active_stress_test` (day 8-11)
- `active_decision` (day 12-14)
- `paused`
- `completed`

Actions:
- `start`
- `complete_reflection`
- `advance_day`
- `pause`
- `resume`
- `finish`

Closure:
- Day 14 can transition to `completed` via `finish`.
- Product should encourage respectful close-the-loop decisions.
