import { describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";

const understandTurnMock = vi.fn();

vi.mock("@/lib/onboarding/lucy/understanding", () => ({
  understandTurn: (...args: unknown[]) => understandTurnMock(...args)
}));

describe("Lucy pending confirmation hardening", () => {
  it("explains numeric confirmations and avoids repeating identical prompt loops", async () => {
    understandTurnMock.mockResolvedValue({
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
        missing_fields: ["past_attribution", "conflict_speed", "support_need", "emotional_openness"]
      }
    });

    understandTurnMock.mockResolvedValueOnce({
      source: "llm",
      fallback_reason: "none",
      provider_used: "openai",
      llm_latency_ms: 120,
      schema_validation_failed: false,
      understanding: {
        assistant_reply: "Thanks, that helps.",
        signals: [
          {
            field: "emotional_openness",
            value: 3,
            confidence: 70,
            evidence: "mixed openness",
            source: "llm"
          }
        ],
        off_topic: { category: null, confidence: 0 },
        safety: { type: null, confidence: 0 },
        needs_confirmation: [],
        missing_fields: ["past_attribution", "conflict_speed", "support_need", "emotional_openness"]
      }
    });

    const seed = createInitialLucySession("pending-user-1");
    seed.extracted_data.past_attribution = "misaligned_goals";
    seed.extraction_envelopes.past_attribution = {
      field: "past_attribution",
      value: "misaligned_goals",
      confidence: 90,
      source: "chat",
      requires_confirmation: false
    };
    seed.extracted_data.conflict_speed = 3;
    seed.extraction_envelopes.conflict_speed = {
      field: "conflict_speed",
      value: 3,
      confidence: 90,
      source: "chat",
      requires_confirmation: false
    };
    seed.extracted_data.support_need = "validation";
    seed.extraction_envelopes.support_need = {
      field: "support_need",
      value: "validation",
      confidence: 90,
      source: "chat",
      requires_confirmation: false
    };

    let state = await processLucyUserMessageConversational(seed, "yes", "pc-1");
    const firstQuestion = state.messages.at(-1)?.content ?? "";
    expect(state.control_flags.pending_confirmation_field).toBe("emotional_openness");
    expect(firstQuestion).toMatch(/3\/5/i);

    state = await processLucyUserMessageConversational(state, "3 out of what?", "pc-2");
    const explanation = state.messages.at(-1)?.content ?? "";
    expect(explanation).toMatch(/scale/i);
    expect(explanation).not.toEqual(firstQuestion);
    expect(state.control_flags.pending_confirmation_explained).toBe(true);
    expect(state.control_flags.user_confusion_turn).toBe(true);

    state = await processLucyUserMessageConversational(state, "idk", "pc-3");
    expect(state.messages.at(-1)?.options?.length ?? 0).toBeGreaterThanOrEqual(5);
    expect(state.control_flags.pending_confirmation_field).toBe("emotional_openness");

    state = await processLucyUserMessageConversational(state, "idk", "pc-4");
    expect(state.control_flags.pending_confirmation_field).toBe("emotional_openness");

    state = await processLucyUserMessageConversational(state, "idk", "pc-5");
    expect(state.control_flags.pending_confirmation_field).toBeUndefined();
  });
});
