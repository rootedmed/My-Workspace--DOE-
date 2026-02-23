import { describe, expect, it } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";

describe("Lucy anti-loop guard", () => {
  it("does not send identical prompt text twice for repeated unclear input", async () => {
    const seed = createInitialLucySession("loop-user-1");
    let state = await processLucyUserMessageConversational(seed, "yes", "loop-1");
    state = await processLucyUserMessageConversational(state, "whatever", "loop-2");
    const firstPrompt = state.messages.at(-1)?.content ?? "";

    state = await processLucyUserMessageConversational(state, "whatever", "loop-3");
    const secondPrompt = state.messages.at(-1)?.content ?? "";

    expect(secondPrompt).not.toEqual(firstPrompt);
    expect((state.control_flags.unresolved_attempts?.past_attribution ?? 0)).toBeGreaterThanOrEqual(1);
  });
});
