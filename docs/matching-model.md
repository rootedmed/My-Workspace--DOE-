# Matching Model and Product Flow

## Product Goal
Build a commitment-first matching workflow that filters for intent and feasibility first, then ranks for relational process compatibility.

## Data Model (MVP, in-memory DB layer)

```ts
UserProfile {
  id: string;
  firstName: string;
  ageRange: "24_30" | "31_37" | "38_45" | "46_plus";
  locationPreference: "same_city" | "relocatable" | "remote_ok";

  intent: {
    lookingFor: "marriage_minded" | "serious_relationship" | "exploring";
    timelineMonths: number;            // expected commitment horizon
    readiness: number;                 // 1-5
    weeklyCapacity: number;            // 1-7 dates/week
  };

  tendencies: {
    attachmentAnxiety: number;         // 0-100
    attachmentAvoidance: number;       // 0-100
    conflictRepair: number;            // 0-100
    emotionalRegulation: number;       // 0-100
    noveltyPreference: number;         // 0-100
  };

  personality: {
    openness: number;                  // 0-100
    conscientiousness: number;         // 0-100
    extraversion: number;              // 0-100
    agreeableness: number;             // 0-100
    emotionalStability: number;        // 0-100
  };

  createdAt: string;
}

MatchResult {
  candidateId: string;
  totalScore: number;                  // 0-100
  hardFilterPass: boolean;
  reasons: string[];
  componentScores: {
    intent: number;
    lifestyle: number;
    attachment: number;
    conflictRegulation: number;
    personality: number;
    novelty: number;
  };
}

DecisionTrack {
  id: string;
  userId: string;
  state: DecisionState;
  day: number;                         // 1-14
  reflectionCount: number;
  createdAt: string;
  updatedAt: string;
}
```

## API Structure (MVP)
- `POST /api/onboarding/complete`
  - Input: onboarding payload
  - Output: `{ profile, tendenciesSummary }`
- `GET /api/matches/preview?userId=...`
  - Output: ranked candidates and score components
- `POST /api/decision-track/start`
  - Input: `{ userId }`
  - Output: new track state + day prompt
- `POST /api/decision-track/advance`
  - Input: `{ trackId, action }`
  - Output: updated state + next prompt
- `GET /api/health`
  - service health and mock DB health

## Hard Filters vs Dynamic Compatibility

### Hard filters (must pass)
1. Intent floor: if either user is `exploring` and other is `marriage_minded` with short timeline, fail.
2. Timeline incompatibility: large gap in commitment horizon (default > 18 months) fails.
3. Capacity mismatch: impossible scheduling overlap (very low capacity mismatch) fails.

### Dynamic compatibility score (0-100)
Weighted sum after hard filters:
- Intent alignment: 25%
- Lifestyle feasibility: 20%
- Attachment complementarity: 15%
- Conflict + emotional regulation: 20%
- Personality fit: 15%
- Novelty/stability fit: 5%

## Scoring Logic
- Convert Likert responses to normalized 0-100 scales.
- Use distance penalties for mismatch dimensions (e.g., novelty preference distance).
- Use asymmetry penalties where relevant (e.g., high anxiety paired with high avoidance).
- Clamp all components to `[0,100]`.

## Decision Track State Machine

States:
- `not_started`
- `active_intro` (days 1-3)
- `active_values` (days 4-7)
- `active_stress_test` (days 8-11)
- `active_decision` (days 12-14)
- `completed`
- `paused`

Actions:
- `start`
- `complete_reflection`
- `advance_day`
- `pause`
- `resume`
- `finish`

Transition rules:
1. `not_started --start--> active_intro`
2. day-based auto phase changes:
   - day 4 -> `active_values`
   - day 8 -> `active_stress_test`
   - day 12 -> `active_decision`
3. day 14 + `finish` -> `completed`
4. any active state can `pause`; `paused` can `resume` to previous phase.

## User Progression (MVP)
1. Complete onboarding (intent + tendencies + profile signals)
2. Receive ranked preview matches
3. Start 14-day decision track
4. Daily reflection + phase nudges
5. Complete track and produce decision summary

## Safety and Language Rules
- Never output diagnosis labels.
- Use terms: "tendencies", "interaction patterns", "fit signals".
- Communicate uncertainty and context dependence.
