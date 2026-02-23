import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";
import type { LucyMessage } from "@/lib/onboarding/lucy/types";
import type { LucyUnderstandingOutcome } from "@/lib/onboarding/lucy/understanding";

const understandTurnMock = vi.fn<(...args: unknown[]) => Promise<LucyUnderstandingOutcome>>();

vi.mock("@/lib/onboarding/lucy/understanding", () => ({
  understandTurn: (...args: unknown[]) => understandTurnMock(...args)
}));

function emptyUnderstanding(): LucyUnderstandingOutcome {
  return {
    source: "rule",
    fallback_reason: "none",
    provider_used: "none",
    llm_latency_ms: 0,
    schema_validation_failed: false,
    understanding: {
      assistant_reply: "",
      signals: [],
      off_topic: { category: null, confidence: 0 },
      safety: { type: null, confidence: 0 },
      needs_confirmation: [],
      missing_fields: [
        "past_attribution",
        "conflict_speed",
        "support_need",
        "emotional_openness",
        "love_expression",
        "relationship_vision",
        "relational_strengths",
        "growth_intention"
      ]
    }
  };
}

function assistantMessages(stateMessages: LucyMessage[]): LucyMessage[] {
  return stateMessages.filter((message) => message.role === "assistant");
}

function duplicateAssistantReplies(messages: LucyMessage[]): number {
  let duplicates = 0;
  let previous = "";
  for (const message of messages) {
    const normalized = message.content.replace(/\s+/g, " ").trim().toLowerCase();
    if (!normalized) continue;
    if (normalized === previous) duplicates += 1;
    previous = normalized;
  }
  return duplicates;
}

describe("Lucy transcript regressions", () => {
  beforeEach(() => {
    understandTurnMock.mockReset();
    understandTurnMock.mockResolvedValue(emptyUnderstanding());
  });

  it("does not get stuck in repeated conflict quick-pick prompts after direct user answers", async () => {
    let state = createInitialLucySession("regression-user-1");
    const turns = [
      "yes",
      "idk its pretty rough out here",
      "people are flaky on dates, and bad at communication",
      "someone reliable and equally invested in a relationship",
      "immediately",
      "2",
      "3",
      "3",
      "why do you keep asking the same thing"
    ];

    for (let index = 0; index < turns.length; index += 1) {
      state = await processLucyUserMessageConversational(state, turns[index]!, `r1-${index + 1}`);
    }

    const assistants = assistantMessages(state.messages);
    const quickPickMessages = assistants.filter((message) => /quick pick/i.test(message.content));
    const duplicates = duplicateAssistantReplies(assistants);

    expect(duplicates).toBe(0);
    expect(quickPickMessages.length).toBeLessThanOrEqual(2);
  });

  it("keeps moving after shorthand conflict answer instead of forcing a loop", async () => {
    let state = createInitialLucySession("regression-user-2");
    state = await processLucyUserMessageConversational(state, "yes", "r2-1");
    state = await processLucyUserMessageConversational(state, "she wasn't as committed", "r2-2");
    state = await processLucyUserMessageConversational(state, "mix of both i guess", "r2-3");
    state = await processLucyUserMessageConversational(state, "she was seeing other guys", "r2-4");

    const assistants = assistantMessages(state.messages);
    const duplicates = duplicateAssistantReplies(assistants);

    expect(duplicates).toBe(0);
  });

  it("clears disputed inferred attribution and does not jump stages after user challenge", async () => {
    understandTurnMock.mockReset();
    understandTurnMock
      .mockResolvedValueOnce({
        source: "llm",
        fallback_reason: "none",
        provider_used: "openai",
        llm_latency_ms: 120,
        schema_validation_failed: false,
        understanding: {
          assistant_reply: "It sounds like you've been feeling lonely and finding it tough to connect with people lately.",
          signals: [
            {
              field: "past_attribution",
              value: "misaligned_goals",
              confidence: 70,
              evidence: "hard to find a connection",
              source: "llm"
            }
          ],
          off_topic: { category: null, confidence: 0 },
          safety: { type: null, confidence: 0 },
          needs_confirmation: [],
          missing_fields: [
            "past_attribution",
            "conflict_speed",
            "support_need",
            "emotional_openness",
            "love_expression",
            "relationship_vision",
            "relational_strengths",
            "growth_intention"
          ]
        }
      })
      .mockResolvedValue({
        source: "rule",
        fallback_reason: "none",
        provider_used: "none",
        llm_latency_ms: 0,
        schema_validation_failed: false,
        understanding: {
          assistant_reply: "",
          signals: [],
          off_topic: { category: null, confidence: 0 },
          safety: { type: null, confidence: 0 },
          needs_confirmation: [],
          missing_fields: [
            "past_attribution",
            "conflict_speed",
            "support_need",
            "emotional_openness",
            "love_expression",
            "relationship_vision",
            "relational_strengths",
            "growth_intention"
          ]
        }
      });

    let state = createInitialLucySession("regression-user-3");
    state = await processLucyUserMessageConversational(state, "It's pretty rough out here, i feel lonely", "r3-1");
    state = await processLucyUserMessageConversational(state, "how did you get there", "r3-2");

    let last = assistantMessages(state.messages).at(-1)?.content ?? "";
    expect(last.toLowerCase()).toContain("what felt like the core issue");

    state = await processLucyUserMessageConversational(state, "i never said misaligned goals. you did", "r3-3");
    last = assistantMessages(state.messages).at(-1)?.content ?? "";

    expect(last.toLowerCase()).not.toContain("talk-now");
    expect(last.toLowerCase()).not.toContain("space-first");
    expect(last.toLowerCase()).toContain("core issue");
    expect(state.extracted_data.past_attribution).toBeUndefined();
  });
});
