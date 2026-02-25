import { mkdir, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runLucyAutonomousIteration } from "@/lib/onboarding/lucy/autonomousProtocol";

describe("Lucy autonomous testing protocol", () => {
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

  it("runs the 15-scenario protocol and writes a debug report artifact", async () => {
    const report = await runLucyAutonomousIteration(1, { engine: "free_chat" });
    await mkdir(".tmp", { recursive: true });
    await writeFile(".tmp/lucy-autonomous-latest.json", JSON.stringify(report, null, 2), "utf8");

    expect(report.scenario_count).toBe(15);
    expect(report.scenario_results.length).toBe(15);
    expect(report.average_scores.extraction_accuracy).toBeGreaterThanOrEqual(1);
    expect(report.average_scores.completion).toBeGreaterThanOrEqual(1);
    expect(report.prioritized_issues.length).toBeGreaterThanOrEqual(0);
  });
});
