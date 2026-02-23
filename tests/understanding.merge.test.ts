import { describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";

const understandTurnMock = vi.fn();

vi.mock("@/lib/onboarding/lucy/understanding", () => ({
  understandTurn: (...args: unknown[]) => understandTurnMock(...args)
}));

function baseUnderstanding() {
  return {
    assistant_reply: "Thanks. Tell me a bit more.",
    signals: [] as Array<{
      field: string;
      value: unknown;
      confidence: number;
      evidence: string;
      source: "llm" | "rule";
    }>,
    off_topic: { category: null, confidence: 0 },
    safety: { type: null, confidence: 0 },
    needs_confirmation: [] as Array<{ field: string; value: unknown; reason: string }>,
    missing_fields: ["past_attribution", "conflict_speed", "support_need"]
  };
}

describe("Lucy understanding merge thresholds", () => {
  it("commits high-confidence signals directly", async () => {
    understandTurnMock.mockResolvedValueOnce({
      source: "llm",
      fallback_reason: "none",
      llm_latency_ms: 200,
      schema_validation_failed: false,
      understanding: {
        ...baseUnderstanding(),
        signals: [
          {
            field: "past_attribution",
            value: "misaligned_goals",
            confidence: 88,
            evidence: "different timelines",
            source: "llm"
          }
        ]
      }
    });

    const seed = createInitialLucySession("merge-user-1");
    const state = await processLucyUserMessageConversational(seed, "yes", "merge-1");

    expect(state.extracted_data.past_attribution).toBe("misaligned_goals");
    expect(state.extraction_envelopes.past_attribution?.confidence).toBeGreaterThanOrEqual(80);
    expect(state.control_flags.pending_confirmation_field).toBeUndefined();
  });

  it("defers medium-confidence confirmation when it is not the lead missing field", async () => {
    understandTurnMock.mockResolvedValueOnce({
      source: "llm",
      fallback_reason: "none",
      llm_latency_ms: 210,
      schema_validation_failed: false,
      understanding: {
        ...baseUnderstanding(),
        signals: [
          {
            field: "growth_intention",
            value: "alignment",
            confidence: 70,
            evidence: "wanted the same direction",
            source: "llm"
          }
        ]
      }
    });

    const seed = createInitialLucySession("merge-user-2");
    const state = await processLucyUserMessageConversational(seed, "yes", "merge-2");

    expect(state.control_flags.pending_confirmation_field).toBeUndefined();
    expect(state.extraction_envelopes.growth_intention?.requires_confirmation).toBe(true);
    expect(state.control_flags.lead_field_jump_count ?? 0).toBeGreaterThanOrEqual(1);
  });
});
