import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { enableFreeConversationMode, processLucyFreeConversationAction } from "@/lib/onboarding/lucy/freeConversationEngine";
import type { LucySessionState } from "@/lib/onboarding/lucy/types";

const VAGUE_OPENERS = [
  "not great",
  "meh",
  "rough",
  "idk",
  "depends",
  "not sure",
  "it's complicated",
  "whatever",
  "could be better"
];

const BANNED_EXPLORATORY_PATTERN =
  /how did that make you feel|can you tell me more|why do you think|did that affect your (confidence|self[\s-]?esteem)|what did you learn from that/i;

function geminiTextResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function geminiRateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", message: "quota exhausted" } }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

function groqTextResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: "stop", message: { content: text } }]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function isConflictPivot(text: string): boolean {
  return /when conflict starts|tension hits|space-first|talk-it-through-now/i.test(text);
}

function hasWarmAck(text: string): boolean {
  return /got it|i hear you|makes sense|that sounds|fair/i.test(text);
}

function seedTopicState(): LucySessionState {
  const seed = enableFreeConversationMode(createInitialLucySession("low-signal-topic"));
  return {
    ...seed,
    control_flags: {
      ...seed.control_flags,
      free_topic_id: "past_attribution",
      free_topic_turn_count: 2,
      free_last_dialogue_act: "direct_bridge",
      free_dialogue_phase: "middle"
    }
  };
}

describe("Lucy free chat low-signal matrix", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.LUCY_FREE_POLICY_MODE;
    delete process.env.LUCY_FREE_POLICY_ADAPTIVE_PERCENT;
  });

  it("handles vague openers without abrupt deep conflict pivots", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.LUCY_FREE_POLICY_MODE = "adaptive";
    process.env.LUCY_FREE_POLICY_ADAPTIVE_PERCENT = "100";

    const fetchMock = vi.fn(async () =>
      geminiTextResponse("Got it. When conflict starts, what do you do first: lean in quickly or step back a bit?")
    );
    vi.stubGlobal("fetch", fetchMock);

    for (const opener of VAGUE_OPENERS) {
      let state = enableFreeConversationMode(createInitialLucySession(`matrix-${opener}`));
      // eslint-disable-next-line no-await-in-loop
      state = await processLucyFreeConversationAction(state, {
        action: "send",
        message: opener,
        clientMessageId: `matrix-${opener}`
      });

      const reply = state.messages.at(-1)?.content ?? "";
      expect(BANNED_EXPLORATORY_PATTERN.test(reply)).toBe(false);
      expect(hasWarmAck(reply)).toBe(true);
      expect(isConflictPivot(reply)).toBe(false);
      expect(reply.includes("?")).toBe(true);
    }
  });

  it("enforces reflect-only budget and avoids consecutive no-question turns", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.LUCY_FREE_POLICY_MODE = "adaptive";
    process.env.LUCY_FREE_POLICY_ADAPTIVE_PERCENT = "100";

    const fetchMock = vi.fn(async () =>
      geminiTextResponse("I hear you. When conflict starts, what do you do first: lean in quickly or step back a bit?")
    );
    vi.stubGlobal("fetch", fetchMock);

    let state = enableFreeConversationMode(createInitialLucySession("reflect-budget"));

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "I'm devastated and idk anymore",
      clientMessageId: "reflect-1"
    });
    const reply1 = state.messages.at(-1)?.content ?? "";
    expect(reply1.includes("?")).toBe(false);

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "Still devastated and idk",
      clientMessageId: "reflect-2"
    });
    const reply2 = state.messages.at(-1)?.content ?? "";
    expect(reply2.includes("?")).toBe(true);

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "Honestly devastated",
      clientMessageId: "reflect-3"
    });
    const reply3 = state.messages.at(-1)?.content ?? "";
    expect(reply3.length).toBeGreaterThan(0);

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "Still devastated",
      clientMessageId: "reflect-4"
    });
    const reply4 = state.messages.at(-1)?.content ?? "";
    expect(!(reply3.includes("?") === false && reply4.includes("?") === false)).toBe(true);
    expect(state.control_flags.free_reflect_only_count).toBeLessThanOrEqual(2);
  });

  it("forces a pivot when topic budget is exhausted", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.LUCY_FREE_POLICY_MODE = "adaptive";

    const fetchMock = vi.fn(async () =>
      geminiTextResponse("Quick rewind: what felt like the core pattern that ended your last relationship?")
    );
    vi.stubGlobal("fetch", fetchMock);

    let state = seedTopicState();
    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "My ex ghosted me again.",
      clientMessageId: "topic-1"
    });

    const reply = state.messages.at(-1)?.content ?? "";
    expect(/core pattern|last relationship|quick rewind/i.test(reply)).toBe(false);
    expect(state.control_flags.free_policy_forced_pivot_last_turn).toBe(true);
  });

  it("keeps style normalized across provider failover", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GROQ_API_KEY = "groq-key";

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("api.groq.com")) {
        return groqTextResponse("Different angle - Can you tell me more about that?");
      }
      return geminiRateLimitedResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    let state = enableFreeConversationMode(createInitialLucySession("style-failover"));
    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "Dating has been rough.",
      clientMessageId: "style-1"
    });

    const reply = state.messages.at(-1)?.content ?? "";
    expect(/different angle/i.test(reply)).toBe(false);
    expect(BANNED_EXPLORATORY_PATTERN.test(reply)).toBe(false);
  });
});
