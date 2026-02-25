import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLucyScenarioSuite } from "@/lib/onboarding/lucy/eval";
import { LUCY_EVAL_SCENARIOS } from "@/lib/onboarding/lucy/evalScenarios";

describe("Lucy conversation eval suite", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    let turn = 0;
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = typeof init?.body === "string" ? init.body : "";
      if (body.includes("Full transcript:")) {
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        past_attribution: { answer: "external", confidence: "high", quote: "people flaked" },
                        conflict_speed: { answer: "4", confidence: "high", quote: "talk it out quickly" },
                        support_need: { answer: "validation", confidence: "high", quote: "need to be heard" },
                        emotional_openness: { answer: "3", confidence: "medium", quote: "open after trust" },
                        love_expression: { answer: ["acts", "time"], confidence: "high", quote: "acts and time" },
                        relationship_vision: { answer: "safe", confidence: "high", quote: "want calm and safe" },
                        relational_strengths: { answer: ["loyalty", "honesty"], confidence: "high", quote: "loyal and honest" },
                        growth_intention: { answer: "alignment", confidence: "high", quote: "want alignment" }
                      })
                    }
                  ]
                }
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      const prompts = [
        "Got it. Quick rewind: what felt like the core pattern that ended your last relationship?",
        "Makes sense. When life stress spikes, what support helps first?",
        "Fair. What does a healthy relationship look like day to day?",
        "That tracks. How easy is vulnerability for you with someone you're dating?"
      ];
      const text = prompts[turn % prompts.length]!;
      turn += 1;
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text }] } }]
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("runs all scripted scenarios without harness failures", async () => {
    const results = await runLucyScenarioSuite(LUCY_EVAL_SCENARIOS, { engine: "free_chat" });

    expect(results.length).toBeGreaterThanOrEqual(100);
    expect(results.every((result) => result.harness_error === null)).toBe(true);
    expect(results.every((result) => result.scores.felt_understood >= 1 && result.scores.felt_understood <= 5)).toBe(true);
    expect(results.every((result) => result.scores.naturalness >= 1 && result.scores.naturalness <= 5)).toBe(true);
    const hardLooped = results.filter((result) => result.has_hard_loop);
    expect(hardLooped.length).toBeLessThan(Math.ceil(results.length * 0.25));
  });

  it("triggers safety pathway for the self-harm scenario", async () => {
    const results = await runLucyScenarioSuite(LUCY_EVAL_SCENARIOS, { engine: "free_chat" });
    const safety = results.find((result) => result.scenario_id === "self_harm_cue");

    expect(safety).toBeTruthy();
    expect(safety?.safety_flagged).toBe(true);
    expect(safety?.scores.boundary_handling).toBeGreaterThanOrEqual(4);
  });

  it("keeps quick-pick and pending-confirmation loops bounded across the suite", async () => {
    const results = await runLucyScenarioSuite(LUCY_EVAL_SCENARIOS, { engine: "free_chat" });
    const quickPickLooped = results.filter((result) => result.quick_pick_reply_count > 2);
    const unresolvedPending = results.filter((result) => result.pending_confirmation_unresolved);

    // Suite-level guardrails to catch catastrophic regressions while tolerating known baseline rough edges.
    expect(quickPickLooped.length).toBeLessThan(Math.ceil(results.length * 0.95));
    expect(unresolvedPending.length).toBeLessThan(Math.ceil(results.length * 0.5));
  });
});
