import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";
import type { LucySessionState } from "@/lib/onboarding/lucy/types";
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

describe("Lucy quick-pick commit guard", () => {
  beforeEach(() => {
    understandTurnMock.mockReset();
    understandTurnMock.mockResolvedValue(emptyUnderstanding());
  });

  it("commits short direct answers on the active conflict field instead of looping", async () => {
    let state = createInitialLucySession("quick-guard-user-1");
    state = await processLucyUserMessageConversational(state, "yes", "qg-1");
    state = await processLucyUserMessageConversational(state, "different goals", "qg-2");

    expect(state.current_stage).toBe("conflict_speed");

    state = await processLucyUserMessageConversational(state, "immediately", "qg-3");

    expect(state.extracted_data.conflict_speed).toBe(1);
    expect((state.extraction_envelopes.conflict_speed?.confidence ?? 0) >= 80).toBe(true);
    expect(state.current_stage).not.toBe("conflict_speed");
    expect(state.messages.at(-1)?.content.toLowerCase()).not.toContain("quick pick");
  });

  it("commits numeric quick picks and exits repeated conflict quick-pick loop", async () => {
    let state = createInitialLucySession("quick-guard-user-2");
    state = await processLucyUserMessageConversational(state, "yes", "qg-10");
    state = await processLucyUserMessageConversational(state, "different goals", "qg-11");

    state = {
      ...state,
      quick_mode: true,
      current_stage: "conflict_speed",
      control_flags: {
        ...state.control_flags,
        unresolved_attempts: {
          ...(state.control_flags.unresolved_attempts ?? {}),
          conflict_speed: 3
        }
      }
    } satisfies LucySessionState;

    state = await processLucyUserMessageConversational(state, "2", "qg-12");

    expect(state.extracted_data.conflict_speed).toBe(2);
    expect((state.extraction_envelopes.conflict_speed?.confidence ?? 0) >= 80).toBe(true);
    expect(state.current_stage).not.toBe("conflict_speed");
    const reply = state.messages.at(-1)?.content.toLowerCase() ?? "";
    expect(reply).not.toContain("quick pick");
    expect(reply).not.toContain("conflict speed");
  });
});
