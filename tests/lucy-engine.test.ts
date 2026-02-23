import { describe, expect, it } from "vitest";
import { createInitialLucySession, processLucyUserMessage, switchLucyQuickMode } from "@/lib/onboarding/lucy/engine";

describe("Lucy engine", () => {
  it("moves from opening to first required stage when user confirms", () => {
    const seed = createInitialLucySession("user-1");
    const next = processLucyUserMessage(seed, "yes, let's start", "m-1");

    expect(next.current_stage).toBe("past_attribution");
    expect(next.stage_states.opening.status).toBe("complete");
    expect(next.messages.at(-1)?.content.toLowerCase()).toContain("past relationship");
  });

  it("offers quick mode after repeated off-topic diversions", () => {
    const seed = createInitialLucySession("user-1");
    const started = processLucyUserMessage(seed, "yes", "m-1");

    let current = started;
    current = processLucyUserMessage(current, "what is your favorite color?", "m-2");
    current = processLucyUserMessage(current, "are you a bot?", "m-3");
    current = processLucyUserMessage(current, "what should i do about my ex?", "m-4");
    current = processLucyUserMessage(current, "fuck this", "m-5");

    expect(current.quick_mode).toBe(true);
    expect(current.off_topic_total).toBeGreaterThanOrEqual(1);
  });

  it("captures answer in quick mode", () => {
    const seed = createInitialLucySession("user-1");
    const started = processLucyUserMessage(seed, "yes", "m-1");
    const quick = switchLucyQuickMode(started);
    const answered = processLucyUserMessage(quick, "conflict_comm", "m-2");

    expect(answered.extracted_data.past_attribution).toBe("conflict_comm");
    expect(answered.stage_states.past_attribution.status).toBe("complete");
  });
});
