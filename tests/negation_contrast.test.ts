import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { understandTurn } from "@/lib/onboarding/lucy/understanding";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("Lucy negation and contrast understanding", () => {
  it("handles contrast and negation patterns in structured output", async () => {
    process.env.LUCY_UNDERSTANDING_MODE = "llm_first_v1";
    process.env.LUCY_LLM_ENABLED = "true";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.LUCY_LLM_MAX_RETRIES = "0";

    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          assistant_reply: "Got it. So you need someone who can talk things through.",
          signals: [
            {
              field: "past_attribution",
              value: "conflict_comm",
              confidence: 91,
              evidence: "they shut down, I wanted to talk",
              source: "llm"
            },
            {
              field: "conflict_speed",
              value: 1,
              confidence: 79,
              evidence: "I wanted to talk right away",
              source: "llm"
            }
          ],
          off_topic: { category: null, confidence: 0 },
          safety: { type: null, confidence: 0 },
          needs_confirmation: [
            {
              field: "conflict_speed",
              value: 1,
              reason: "inferred from contrast statement"
            }
          ],
          missing_fields: ["support_need", "relationship_vision"]
        })
      })
    } as Response);

    const state = createInitialLucySession("negation-user-1");
    const outcome = await understandTurn({
      state,
      userMessage: "they needed space, i wanted to talk. i don't want shutdowns again.",
      missingFields: ["past_attribution", "conflict_speed", "support_need"]
    });

    expect(outcome.source).toBe("llm");
    expect(outcome.understanding.signals.some((signal) => signal.field === "past_attribution" && signal.value === "conflict_comm")).toBe(true);
    expect(outcome.understanding.needs_confirmation[0]?.field).toBe("conflict_speed");
  });
});
