import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";

const understandTurnMock = vi.fn();

vi.mock("@/lib/onboarding/lucy/understanding", () => ({
  understandTurn: (...args: unknown[]) => understandTurnMock(...args)
}));

function baseUnderstanding() {
  return {
    source: "llm" as const,
    fallback_reason: "none" as const,
    provider_used: "gemini" as const,
    llm_latency_ms: 120,
    schema_validation_failed: false,
    understanding: {
      assistant_reply: "I'm here to help. Tell me a little more.",
      signals: [],
      off_topic: { category: null, confidence: 0 },
      safety: { type: null, confidence: 0 },
      needs_confirmation: [],
      missing_fields: ["past_attribution", "conflict_speed", "support_need"]
    }
  };
}

describe("Lucy inference jump guard", () => {
  beforeEach(() => {
    understandTurnMock.mockReset();
  });

  it("does not ask conflict pace confirmation from ungrounded evidence", async () => {
    understandTurnMock
      .mockResolvedValueOnce(baseUnderstanding())
      .mockResolvedValueOnce({
        ...baseUnderstanding(),
        understanding: {
          ...baseUnderstanding().understanding,
          assistant_reply: "That sounds frustrating.",
          signals: [
            {
              field: "past_attribution",
              value: "misaligned_goals",
              confidence: 86,
              evidence: "no intention",
              source: "llm"
            },
            {
              field: "conflict_speed",
              value: 5,
              confidence: 75,
              evidence: "flaky dates and no communication",
              source: "llm"
            }
          ]
        }
      });

    let state = createInitialLucySession("jump-guard-user-1");
    state = await processLucyUserMessageConversational(state, "yes", "jg-1");
    state = await processLucyUserMessageConversational(
      state,
      "Theres no good communication, flaky dates, no intention",
      "jg-2"
    );

    const last = state.messages.at(-1)?.content.toLowerCase() ?? "";
    expect(state.control_flags.pending_confirmation_field).toBeUndefined();
    expect(last).not.toContain("i read your conflict pace");
  });

  it("handles interpretation challenge by clearing pending confirmation and re-asking naturally", async () => {
    understandTurnMock.mockResolvedValue(baseUnderstanding());

    let state = createInitialLucySession("jump-guard-user-2");
    state = await processLucyUserMessageConversational(state, "yes", "jg-3");
    state = {
      ...state,
      control_flags: {
        ...state.control_flags,
        pending_confirmation_field: "conflict_speed",
        pending_confirmation_value: 5,
        pending_confirmation_confidence: 70,
        pending_confirmation_question:
          "I read your conflict pace as 5/5 (space first). Scale: 1=talk now, 3=depends, 5=space first. Keep this?"
      }
    };

    state = await processLucyUserMessageConversational(
      state,
      "Woah how did you jump to that conclusion",
      "jg-4"
    );

    const last = state.messages.at(-1)?.content ?? "";
    expect(last.toLowerCase()).toContain("my assumption");
    expect(last.toLowerCase()).toContain("what do you usually do first");
    expect(state.control_flags.pending_confirmation_field).toBeUndefined();
  });
});
