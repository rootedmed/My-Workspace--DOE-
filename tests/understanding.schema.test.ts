import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { understandTurn } from "@/lib/onboarding/lucy/understanding";

const ORIGINAL_ENV = { ...process.env };

function enableLlmEnv() {
  process.env.LUCY_UNDERSTANDING_MODE = "llm_first_v1";
  process.env.LUCY_LLM_ENABLED = "true";
  process.env.OPENAI_API_KEY = "test-key";
  process.env.LUCY_LLM_MAX_RETRIES = "0";
  process.env.LUCY_LLM_TIMEOUT_MS = "2200";
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("Lucy understanding schema validation", () => {
  it("accepts valid structured JSON and returns llm source", async () => {
    enableLlmEnv();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          assistant_reply: "That makes sense. What do you want to feel more of next time?",
          signals: [
            {
              field: "past_attribution",
              value: "misaligned_goals",
              confidence: 88,
              evidence: "hookups and no commitment",
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

    const state = createInitialLucySession("understanding-user-1");
    const outcome = await understandTurn({
      state,
      userMessage: "im done with hookups",
      missingFields: ["past_attribution", "conflict_speed", "support_need"]
    });

    expect(outcome.source).toBe("llm");
    expect(outcome.fallback_reason).toBe("none");
    expect(outcome.understanding.signals[0]?.field).toBe("past_attribution");
    expect(outcome.understanding.signals[0]?.value).toBe("misaligned_goals");
  });

  it("falls back to rule mode on invalid JSON", async () => {
    enableLlmEnv();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ output_text: "not valid json" })
    } as Response);

    const state = createInitialLucySession("understanding-user-2");
    const outcome = await understandTurn({
      state,
      userMessage: "we had communication issues",
      missingFields: ["past_attribution"]
    });

    expect(outcome.source).toBe("rule");
    expect(outcome.fallback_reason).toBe("llm_invalid_json");
    expect(outcome.schema_validation_failed).toBe(true);
    expect(outcome.understanding.signals.length).toBeGreaterThan(0);
  });

  it("normalizes loose but parseable JSON instead of falling back", async () => {
    enableLlmEnv();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          assistant_reply: "",
          signals: [
            {
              field: "past_attribution",
              value: "misaligned_goals",
              confidence: "88",
              evidence: "hookups and no commitment"
            }
          ],
          off_topic: { category: null, confidence: "0" },
          safety: { type: null, confidence: "0" },
          needs_confirmation: [],
          missing_fields: ["conflict_speed", "support_need"]
        })
      })
    } as Response);

    const state = createInitialLucySession("understanding-user-3");
    const outcome = await understandTurn({
      state,
      userMessage: "im done with hookups",
      missingFields: ["past_attribution", "conflict_speed", "support_need"]
    });

    expect(outcome.source).toBe("llm");
    expect(outcome.fallback_reason).toBe("none");
    expect(outcome.schema_validation_failed).toBe(false);
    expect(outcome.understanding.signals[0]?.field).toBe("past_attribution");
  });

  it("accepts JSON5-style output (single quotes + unquoted keys) without fallback", async () => {
    enableLlmEnv();
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        output_text:
          "{assistant_reply:'Got it.',signals:[{field:'past_attribution',value:'misaligned_goals',confidence:87,evidence:'different goals'}],off_topic:{category:null,confidence:0},safety:{type:null,confidence:0},needs_confirmation:[],missing_fields:['conflict_speed']}"
      })
    } as Response);

    const state = createInitialLucySession("understanding-user-4");
    const outcome = await understandTurn({
      state,
      userMessage: "we wanted different things",
      missingFields: ["past_attribution", "conflict_speed", "support_need"]
    });

    expect(outcome.source).toBe("llm");
    expect(outcome.fallback_reason).toBe("none");
    expect(outcome.understanding.signals[0]?.field).toBe("past_attribution");
    expect(outcome.understanding.signals[0]?.value).toBe("misaligned_goals");
  });
});
