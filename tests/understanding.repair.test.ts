import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { understandTurn } from "@/lib/onboarding/lucy/understanding";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("Lucy understanding repair retry", () => {
  it("retries same provider with repair prompt after invalid JSON and succeeds", async () => {
    process.env.LUCY_UNDERSTANDING_MODE = "llm_first_v1";
    process.env.LUCY_LLM_ENABLED = "true";
    process.env.LUCY_LLM_PROVIDER_CHAIN = "gemini";
    process.env.GEMINI_API_KEY = "gem-test";
    process.env.LUCY_LLM_MAX_RETRIES = "0";

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: "here's what I think: you value commitment" }]
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
                parts: [
                  {
                    text: JSON.stringify({
                      assistant_reply: "Got it. Commitment alignment matters here.",
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
                  }
                ]
              }
            }
          ]
        })
      } as Response);

    const state = createInitialLucySession("repair-user-1");
    const outcome = await understandTurn({
      state,
      userMessage: "im done with hookups and no labels",
      missingFields: ["past_attribution", "conflict_speed", "support_need"]
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(outcome.source).toBe("llm");
    expect(outcome.fallback_reason).toBe("none");
    expect(outcome.provider_used).toBe("gemini");
    expect(outcome.understanding.signals[0]?.field).toBe("past_attribution");
  });
});
