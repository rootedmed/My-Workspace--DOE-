import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { enableFreeConversationMode, processLucyFreeConversationAction } from "@/lib/onboarding/lucy/freeConversationEngine";

const BANNED_EXPLORATORY_PATTERN =
  /how did that make you feel|can you tell me more|why do you think|did that affect your (confidence|self[\s-]?esteem)|what did you learn from that/i;
const PAST_BREAKUP_PATTERN =
  /core pattern|main thing that kept breaking|last relationship|ended your last relationship|what went wrong|past relationship/i;
const FORWARD_DIMENSION_PATTERN =
  /conflict|tension|space|open up|vulnerab|stress|support|healthy relationship|show someone you care|bring to a relationship|different.*next relationship/i;

function geminiTextResponse(text: string): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("Lucy free chat no-history regression", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("blocks repeated past-breakup prompts after user says they have no relationship history", async () => {
    process.env.GEMINI_API_KEY = "test-key";

    const scriptedReplies = [
      "Got it. When things aren't going well, what's the most common reason you've found for disagreements or friction in past relationships?",
      "Okay, no worries. When conflict starts, what do you do first: lean in quickly or step back a bit?",
      "Got it. Quick rewind: what felt like the core pattern that ended your last relationship?",
      "Okay, thanks for sharing. Putting it simply, what was the main thing that kept breaking the relationship?",
      "It sounds like you haven't had a long-term relationship. Putting it simply, what was the main thing that kept breaking the relationship?"
    ];
    let callIndex = 0;
    const fetchMock = vi.fn(async () => {
      const text = scriptedReplies[Math.min(callIndex, scriptedReplies.length - 1)] ?? scriptedReplies[0]!;
      callIndex += 1;
      return geminiTextResponse(text);
    });
    vi.stubGlobal("fetch", fetchMock);

    let state = enableFreeConversationMode(createInitialLucySession("no-history-regression"));

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "not very good",
      clientMessageId: "no-history-1"
    });
    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "idk",
      clientMessageId: "no-history-2"
    });
    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "lean in",
      clientMessageId: "no-history-3"
    });
    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "i never had one",
      clientMessageId: "no-history-4"
    });
    const replyAfterNoHistory = state.messages.at(-1)?.content ?? "";

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "slowly",
      clientMessageId: "no-history-5"
    });
    const followupReply = state.messages.at(-1)?.content ?? "";

    expect(state.extracted_data.past_attribution).toBe("no_history");
    expect(replyAfterNoHistory).toMatch(/\?$/);
    expect(followupReply).toMatch(/\?$/);
    expect(PAST_BREAKUP_PATTERN.test(replyAfterNoHistory.toLowerCase())).toBe(false);
    expect(PAST_BREAKUP_PATTERN.test(followupReply.toLowerCase())).toBe(false);
    expect(BANNED_EXPLORATORY_PATTERN.test(replyAfterNoHistory.toLowerCase())).toBe(false);
    expect(BANNED_EXPLORATORY_PATTERN.test(followupReply.toLowerCase())).toBe(false);
    expect(FORWARD_DIMENSION_PATTERN.test(replyAfterNoHistory.toLowerCase())).toBe(true);
    expect(followupReply.length).toBeGreaterThan(0);
  });
});
