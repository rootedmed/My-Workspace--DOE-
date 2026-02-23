import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { understandTurn } from "@/lib/onboarding/lucy/understanding";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...ORIGINAL_ENV };
});

describe("Lucy LLM timeout fallback", () => {
  it("falls back to rules when LLM call times out", async () => {
    process.env.LUCY_UNDERSTANDING_MODE = "llm_first_v1";
    process.env.LUCY_LLM_ENABLED = "true";
    process.env.OPENAI_API_KEY = "test-key";
    process.env.LUCY_LLM_MAX_RETRIES = "0";

    const timeoutError = Object.assign(new Error("timeout"), { name: "AbortError" });
    vi.spyOn(global, "fetch").mockRejectedValue(timeoutError);

    const state = createInitialLucySession("timeout-user-1");
    const outcome = await understandTurn({
      state,
      userMessage: "communication issues and different goals",
      missingFields: ["past_attribution", "conflict_speed"]
    });

    expect(outcome.source).toBe("rule");
    expect(outcome.fallback_reason).toBe("llm_timeout");
    expect(outcome.understanding.signals.length).toBeGreaterThan(0);
  });
});
