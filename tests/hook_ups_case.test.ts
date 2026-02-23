import { describe, expect, it } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";

describe("Lucy hook ups case", () => {
  it("maps hook ups language to misaligned goals without repeating the same question", async () => {
    const seed = createInitialLucySession("hooks-user-1");
    let state = await processLucyUserMessageConversational(seed, "yes", "hooks-1");
    const before = state.messages.at(-1)?.content ?? "";

    state = await processLucyUserMessageConversational(state, "hook ups", "hooks-2");
    const after = state.messages.at(-1)?.content ?? "";

    expect(state.extracted_data.past_attribution).toBe("misaligned_goals");
    expect(state.current_stage).not.toBe("past_attribution");
    expect(after).not.toEqual(before);
  });
});
