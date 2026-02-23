import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { understandTurn } from "@/lib/onboarding/lucy/understanding";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("Lucy provider failover", () => {
  it("falls through to next provider when first provider returns invalid JSON", async () => {
    process.env.LUCY_UNDERSTANDING_MODE = "llm_first_v1";
    process.env.LUCY_LLM_ENABLED = "true";
    process.env.LUCY_LLM_PROVIDER_CHAIN = "gemini,openai";
    process.env.GEMINI_API_KEY = "gem-test";
    process.env.OPENAI_API_KEY = "openai-test";
    process.env.LUCY_LLM_MAX_RETRIES = "0";

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: "not-json" }]
              }
            }
          ]
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: "still-not-json" }]
              }
            }
          ]
        })
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          output_text: JSON.stringify({
            assistant_reply: "Got it. Sounds like commitment alignment matters most.",
            signals: [
              {
                field: "past_attribution",
                value: "misaligned_goals",
                confidence: 90,
                evidence: "hookups and no labels",
                source: "llm"
              }
            ],
            off_topic: { category: null, confidence: 0 },
            safety: { type: null, confidence: 0 },
            needs_confirmation: [],
            missing_fields: ["conflict_speed", "support_need"]
          })
        })
      } as Response);

    const state = createInitialLucySession("provider-user-1");
    const outcome = await understandTurn({
      state,
      userMessage: "im done with hookups and no labels",
      missingFields: ["past_attribution", "conflict_speed", "support_need"]
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(outcome.source).toBe("llm");
    expect(outcome.fallback_reason).toBe("none");
    expect(outcome.schema_validation_failed).toBe(false);
    expect(outcome.understanding.signals[0]?.field).toBe("past_attribution");
    expect(outcome.understanding.signals[0]?.value).toBe("misaligned_goals");
  });
});
