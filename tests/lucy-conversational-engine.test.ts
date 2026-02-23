import { describe, expect, it } from "vitest";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";

describe("Lucy conversational engine", () => {
  it("extracts multiple signals from one venting turn", async () => {
    const seed = createInitialLucySession("conv-user-1");
    let state = await processLucyUserMessageConversational(seed, "yes", "c-1");
    state = await processLucyUserMessageConversational(
      state,
      "my ex would go silent for days after fights and i felt unseen",
      "c-2"
    );

    expect(state.extracted_data.past_attribution).toBeDefined();
    expect(state.extraction_envelopes.past_attribution?.confidence ?? 0).toBeGreaterThanOrEqual(80);
    expect(state.messages.at(-1)?.role).toBe("assistant");
  });

  it("stores medium-confidence inferences and defers confirmation when non-lead", async () => {
    const seed = createInitialLucySession("conv-user-2");
    let state = await processLucyUserMessageConversational(seed, "yes", "c-1");
    state = await processLucyUserMessageConversational(
      state,
      "we wanted different timelines",
      "c-2"
    );

    expect(state.control_flags.pending_confirmation_field).toBeUndefined();
    expect(state.extraction_envelopes.growth_intention?.requires_confirmation).toBe(true);
  });

  it("handles safety cues with safety flag", async () => {
    const seed = createInitialLucySession("conv-user-3");
    let state = await processLucyUserMessageConversational(seed, "yes", "c-1");
    state = await processLucyUserMessageConversational(state, "i want to hurt myself", "c-2");

    expect(state.control_flags.safety_flag).toBe(true);
    expect(state.messages.at(-1)?.kind).toBe("safety");
  });

  it("maps 'hook ups' to misaligned goals instead of re-asking blindly", async () => {
    const seed = createInitialLucySession("conv-user-4");
    let state = await processLucyUserMessageConversational(seed, "yes", "c-1");
    state = await processLucyUserMessageConversational(state, "hook ups", "c-2");

    expect(state.extracted_data.past_attribution).toBe("misaligned_goals");
    expect(state.extraction_envelopes.past_attribution?.confidence ?? 0).toBeGreaterThanOrEqual(80);
    expect(state.current_stage).not.toBe("past_attribution");
  });
});
