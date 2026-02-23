import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";

const understandTurnMock = vi.fn();

vi.mock("@/lib/onboarding/lucy/understanding", () => ({
  understandTurn: (...args: unknown[]) => understandTurnMock(...args)
}));

function emptyUnderstanding() {
  return {
    source: "llm" as const,
    fallback_reason: "none" as const,
    provider_used: "gemini" as const,
    llm_latency_ms: 110,
    schema_validation_failed: false,
    understanding: {
      assistant_reply: "",
      signals: [],
      off_topic: { category: null, confidence: 0 },
      safety: { type: null, confidence: 0 },
      needs_confirmation: [],
      missing_fields: ["past_attribution", "conflict_speed", "support_need", "emotional_openness"]
    }
  };
}

describe("Lucy acknowledgement recovery", () => {
  beforeEach(() => {
    understandTurnMock.mockReset();
    understandTurnMock.mockResolvedValue(emptyUnderstanding());
  });

  it("does not escalate to rigid forced-choice when user only sends acknowledgment", async () => {
    const seed = createInitialLucySession("ack-user-1");
    let state = await processLucyUserMessageConversational(seed, "yes", "ack-1");
    state = await processLucyUserMessageConversational(state, "Its definitely rough out here", "ack-2");
    const firstAsk = state.messages.at(-1)?.content ?? "";

    state = await processLucyUserMessageConversational(state, "sounds good", "ack-3");
    const secondAsk = state.messages.at(-1)?.content ?? "";

    expect(firstAsk.toLowerCase()).toContain("pattern in past dating");
    expect(secondAsk.toLowerCase()).toContain("what did that look like");
    expect(secondAsk.toLowerCase()).not.toContain("would you say the bigger issue");
  });
});
