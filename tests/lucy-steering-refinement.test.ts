import { mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";
import type { LucyAnswerField, LucyMessage, LucySessionState } from "@/lib/onboarding/lucy/types";

const REQUIRED_FIELDS: LucyAnswerField[] = [
  "past_attribution",
  "conflict_speed",
  "support_need",
  "emotional_openness",
  "love_expression",
  "relationship_vision",
  "relational_strengths",
  "growth_intention"
];

type ScenarioSpec = {
  id: string;
  userType: "over_sharer" | "brief" | "tangent" | "balanced" | "emotionally_heavy";
  targetMin: number;
  targetMax: number;
  turns: string[];
};

type ScenarioReport = {
  id: string;
  userType: ScenarioSpec["userType"];
  target_exchanges: string;
  exchanges_to_completion: number;
  completed: boolean;
  dimensions: Record<LucyAnswerField, { covered: boolean; confidence: number; level: "low" | "medium" | "high" }>;
  robotic_transition_hits: string[];
  user_satisfaction_score_1_to_5: number;
  user_satisfaction_label: "high" | "medium" | "low";
  transcript: Array<{ role: "assistant" | "user"; content: string; kind?: LucyMessage["kind"] }>;
};

const SCENARIOS: ScenarioSpec[] = [
  {
    id: "test_1_over_sharer",
    userType: "over_sharer",
    targetMin: 14,
    targetMax: 16,
    turns: [
      "yes",
      "my ex was emotionally unavailable and always shut down when things got real. i kept feeling like i was too much for wanting depth",
      "then his friends said i was overthinking and i just felt unseen and exhausted",
      "in conflict i'm talk-now, and when i'm stressed i need to be heard first",
      "i open up slowly but deeply once trust is there, and i show love through acts of care and quality time",
      "healthy for me is best-friend energy with calm stability. i bring loyalty and honesty",
      "next time i want deeper honesty and emotional depth. yes"
    ]
  },
  {
    id: "test_2_brief",
    userType: "brief",
    targetMin: 12,
    targetMax: 14,
    turns: [
      "yes",
      "bad communication",
      "2. validation",
      "4",
      "acts, safe",
      "loyalty, peace, yes"
    ]
  },
  {
    id: "test_3_tangent",
    userType: "tangent",
    targetMin: 15,
    targetMax: 18,
    turns: [
      "yes",
      "before this i switched jobs and moved cities so life has been chaos",
      "the relationship ended because we wanted different timelines",
      "what's your favorite color",
      "in conflict i'm a 4 and when stressed i need listening not fixing",
      "4. i open up slowly with trust and show love with words plus acts",
      "i want independent together, and i bring consistency and support",
      "next time i want alignment. yes"
    ]
  },
  {
    id: "test_4_balanced",
    userType: "balanced",
    targetMin: 12,
    targetMax: 15,
    turns: [
      "yes",
      "our long-term goals didn't line up",
      "i usually cool down then talk soon after",
      "practical help works best when i'm stressed",
      "i open with trust, and i show love through acts and time",
      "i want an independent partnership, i bring consistency and honesty",
      "alignment this time. yes"
    ]
  },
  {
    id: "test_5_emotionally_heavy",
    userType: "emotionally_heavy",
    targetMin: 16,
    targetMax: 20,
    turns: [
      "yes",
      "my last relationship had emotional abuse and constant criticism, i started doubting myself",
      "i still get flashbacks and i need someone calm and safe, not someone who weaponizes silence",
      "in conflict i'm a 2, i cool down briefly then repair directly",
      "when stressed i need validation and physical presence, and i open up slowly once i feel safe",
      "i show love with consistency, words, and thoughtful acts",
      "healthy to me is a safe calm space, and i'm proud of my loyalty and support",
      "next time i want peace and mutual respect",
      "yes"
    ]
  }
];

function confidenceLevel(confidence: number): "low" | "medium" | "high" {
  if (confidence >= 80) return "high";
  if (confidence >= 60) return "medium";
  return "low";
}

function dimensionCoverage(state: LucySessionState): ScenarioReport["dimensions"] {
  return REQUIRED_FIELDS.reduce(
    (acc, field) => {
      const value = state.extracted_data[field];
      const covered = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
      const confidence = state.extraction_envelopes[field]?.confidence ?? 0;
      acc[field] = {
        covered,
        confidence,
        level: confidenceLevel(confidence)
      };
      return acc;
    },
    {} as ScenarioReport["dimensions"]
  );
}

function roboticTransitionHits(messages: LucyMessage[]): string[] {
  const pattern = /quick pick|pick a number|if forced to pick|different angle|choose from options/i;
  return messages
    .filter((entry) => entry.role === "assistant" && pattern.test(entry.content))
    .map((entry) => entry.content);
}

function satisfactionScore(report: Omit<ScenarioReport, "user_satisfaction_score_1_to_5" | "user_satisfaction_label">): number {
  let score = 5;
  const inTarget =
    report.exchanges_to_completion >= Number(report.target_exchanges.split("-")[0]) &&
    report.exchanges_to_completion <= Number(report.target_exchanges.split("-")[1]);
  if (!report.completed) score -= 2;
  if (!inTarget) score -= 1;
  if (report.robotic_transition_hits.length > 0) score -= 1;

  const lowConfidenceCount = Object.values(report.dimensions).filter((entry) => entry.level === "low").length;
  if (lowConfidenceCount >= 3) score -= 1;

  return Math.max(1, Math.min(5, score));
}

function satisfactionLabel(score: number): "high" | "medium" | "low" {
  if (score >= 4) return "high";
  if (score >= 3) return "medium";
  return "low";
}

async function runScenario(spec: ScenarioSpec): Promise<ScenarioReport> {
  let state = createInitialLucySession(`steering-${spec.id}`);

  for (let turn = 0; turn < spec.turns.length; turn += 1) {
    state = await processLucyUserMessageConversational(state, spec.turns[turn]!, `${spec.id}-${turn + 1}`);
    if (state.completed) break;
  }

  const conversationalMessages = state.messages.filter(
    (entry): entry is LucyMessage & { role: "assistant" | "user" } =>
      entry.role === "assistant" || entry.role === "user"
  );
  const reportBase: Omit<ScenarioReport, "user_satisfaction_score_1_to_5" | "user_satisfaction_label"> = {
    id: spec.id,
    userType: spec.userType,
    target_exchanges: `${spec.targetMin}-${spec.targetMax}`,
    exchanges_to_completion: conversationalMessages.length,
    completed: state.completed,
    dimensions: dimensionCoverage(state),
    robotic_transition_hits: roboticTransitionHits(state.messages),
    transcript: conversationalMessages.map((entry) => ({
      role: entry.role,
      content: entry.content,
      kind: entry.kind
    }))
  };

  const score = satisfactionScore(reportBase);
  return {
    ...reportBase,
    user_satisfaction_score_1_to_5: score,
    user_satisfaction_label: satisfactionLabel(score)
  };
}

describe("Lucy steering refinement harness", () => {
  it("runs five steering scenarios and writes a report artifact", async () => {
    const results: ScenarioReport[] = [];
    for (const scenario of SCENARIOS) {
      // eslint-disable-next-line no-await-in-loop
      results.push(await runScenario(scenario));
    }

    await mkdir(".tmp", { recursive: true });
    await writeFile(
      ".tmp/lucy-steering-refinement.json",
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          results
        },
        null,
        2
      ),
      "utf8"
    );

    expect(results).toHaveLength(5);
    expect(results.every((entry) => entry.id.length > 0)).toBe(true);
  });
});
