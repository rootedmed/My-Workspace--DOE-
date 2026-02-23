import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";
import type { LucyUnderstandingOutcome } from "@/lib/onboarding/lucy/understanding";

const understandTurnMock = vi.fn<(...args: unknown[]) => Promise<LucyUnderstandingOutcome>>();

vi.mock("@/lib/onboarding/lucy/understanding", () => ({
  understandTurn: (...args: unknown[]) => understandTurnMock(...args)
}));

function emptyUnderstanding(): LucyUnderstandingOutcome {
  return {
    source: "rule",
    fallback_reason: "none",
    provider_used: "none",
    llm_latency_ms: 0,
    schema_validation_failed: false,
    understanding: {
      assistant_reply: "",
      signals: [],
      off_topic: { category: null, confidence: 0 },
      safety: { type: null, confidence: 0 },
      needs_confirmation: [],
      missing_fields: [
        "past_attribution",
        "conflict_speed",
        "support_need",
        "emotional_openness",
        "love_expression",
        "relationship_vision",
        "relational_strengths",
        "growth_intention"
      ]
    }
  };
}

describe("Lucy conflict capture regression", () => {
  beforeEach(() => {
    understandTurnMock.mockReset();
    understandTurnMock.mockResolvedValue(emptyUnderstanding());
  });

  it("captures conflict speed from cool-down then talk-soon phrasing", async () => {
    let state = createInitialLucySession("conflict-capture-1");
    state = await processLucyUserMessageConversational(state, "yes", "cc-1");
    state = await processLucyUserMessageConversational(
      state,
      "I think my last relationship ended mostly because our long-term goals did not line up.",
      "cc-2"
    );
    state = await processLucyUserMessageConversational(state, "I usually cool down a bit and then talk soon after.", "cc-3");

    expect(state.extracted_data.conflict_speed).toBe(2);
    expect((state.extraction_envelopes.conflict_speed?.confidence ?? 0) >= 80).toBe(true);
  });
});
