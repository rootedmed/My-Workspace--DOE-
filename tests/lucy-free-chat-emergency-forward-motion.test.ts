import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { enableFreeConversationMode, processLucyFreeConversationAction } from "@/lib/onboarding/lucy/freeConversationEngine";
import type { LucyAnswerField, LucyMessage, LucySessionState } from "@/lib/onboarding/lucy/types";

const REQUIRED_FIELDS: LucyAnswerField[] = [
  "past_attribution",
  "conflict_speed",
  "support_need",
  "emotional_openness",
  "love_expression",
  "relationship_vision",
  "relational_strengths",
  "growth_intention"
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

function fullExtractionPayload(): Record<string, unknown> {
  return {
    past_attribution: { answer: "external", confidence: "high", quote: "people kept flaking on me" },
    conflict_speed: { answer: "4", confidence: "high", quote: "i want to talk things through quickly" },
    support_need: { answer: "validation", confidence: "high", quote: "i need to be heard first" },
    emotional_openness: { answer: "3", confidence: "medium", quote: "i open up after trust builds" },
    love_expression: { answer: ["acts", "time"], confidence: "high", quote: "i show care through effort and time" },
    relationship_vision: { answer: "safe", confidence: "high", quote: "i want calm, safe consistency" },
    relational_strengths: { answer: ["loyalty", "honesty"], confidence: "high", quote: "i am loyal and honest" },
    growth_intention: { answer: "alignment", confidence: "high", quote: "i want better alignment next time" }
  };
}

function classifyQuestionType(question: string): LucyAnswerField | "exploratory" {
  const normalized = question.toLowerCase();
  if (/conflict|tension|argument|space-first|talk-it-through/i.test(normalized)) return "conflict_speed";
  if (/vulnerab|open up|trust|guarded/i.test(normalized)) return "emotional_openness";
  if (/healthy relationship|day-to-day|long-term|relationship structure/i.test(normalized)) return "relationship_vision";
  if (/past|last relationship|ended|core pattern/i.test(normalized)) return "past_attribution";
  if (/stress|support|from a partner|feel cared/i.test(normalized)) return "support_need";
  if (/different in your next relationship|looking ahead|change matters/i.test(normalized)) return "growth_intention";
  if (/show love|show someone you care/i.test(normalized)) return "love_expression";
  if (/bring to a relationship|relationship strengths|genuinely proud/i.test(normalized)) return "relational_strengths";
  return "exploratory";
}

function assistantMessages(state: LucySessionState): LucyMessage[] {
  return state.messages.filter((message) => message.role === "assistant");
}

function assertNoBannedExploration(state: LucySessionState): void {
  for (const message of assistantMessages(state)) {
    expect(BANNED_EXPLORATORY_PATTERN.test(message.content)).toBe(false);
  }
}

function assertNoRepeatedQuestionTypeLoops(state: LucySessionState): void {
  const questionTypes = assistantMessages(state)
    .filter((message) => message.content.includes("?"))
    .map((message) => classifyQuestionType(message.content));

  const hasConsecutiveRepeat = questionTypes.some((type, index) => {
    if (type === "exploratory" || index === 0) return false;
    return questionTypes[index - 1] === type;
  });
  expect(hasConsecutiveRepeat).toBe(false);
}

function assertAllEightDimensionsExtracted(state: LucySessionState): void {
  for (const field of REQUIRED_FIELDS) {
    const value = state.extracted_data[field];
    const covered = Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null;
    expect(covered).toBe(true);
    expect((state.extraction_envelopes[field]?.confidence ?? 0) >= 60).toBe(true);
  }
}

function buildFetchMock(chatDrafts: string[]) {
  let chatIndex = 0;
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? init.body : "";
    if (body.includes("Full transcript:")) {
      return geminiTextResponse(JSON.stringify(fullExtractionPayload()));
    }
    const draft = chatDrafts[Math.min(chatIndex, chatDrafts.length - 1)] ?? "Got it.";
    chatIndex += 1;
    return geminiTextResponse(draft);
  });
}

async function runScenario(
  id: string,
  userTurns: string[]
): Promise<{ state: LucySessionState; sendReplies: string[]; exchanges: number }> {
  let state = enableFreeConversationMode(createInitialLucySession(id));
  const sendReplies: string[] = [];

  for (let turn = 0; turn < userTurns.length; turn += 1) {
    // eslint-disable-next-line no-await-in-loop
    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: userTurns[turn]!,
      clientMessageId: `${id}-turn-${turn + 1}`
    });
    sendReplies.push(state.messages.at(-1)?.content ?? "");
  }

  state = await processLucyFreeConversationAction(state, { action: "finish" });
  const exchanges = state.messages.filter((message) => message.role === "assistant" || message.role === "user").length;
  return { state, sendReplies, exchanges };
}

describe("Lucy free chat emergency forward-motion guardrails", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });

  it("breaks flaked-on drill loops and completes in 12-16 exchanges with full coverage", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      buildFetchMock([
        "That sounds frustrating. How did that make you feel when they flaked?",
        "Can you tell me more about those flakes?",
        "Why do you think they kept doing that?",
        "Did that affect your confidence in dating?",
        "What did you learn from that?",
        "I hear you."
      ])
    );

    const { state, exchanges } = await runScenario(
      "emergency-flaked-loop",
      [
        "I've felt better before.",
        "It used to be lively and now people flake constantly.",
        "I mostly keep trying but it feels repetitive.",
        "When conflict happens I prefer talking it out quickly.",
        "I open up once trust is there.",
        "I want calm consistency and better alignment this time."
      ]
    );

    expect(exchanges >= 12 && exchanges <= 16).toBe(true);
    assertNoBannedExploration(state);
    assertNoRepeatedQuestionTypeLoops(state);
    assertAllEightDimensionsExtracted(state);
    expect(state.completed).toBe(true);
  });

  it("handles brief responders without over-probing and still completes in 12-16 exchanges", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      buildFetchMock([
        "How did that make you feel?",
        "Can you tell me more?",
        "How did that make you feel?",
        "Can you tell me more?",
        "Why do you think that happened?",
        "Got it."
      ])
    );

    const { state, exchanges } = await runScenario("emergency-brief", [
      "Not great.",
      "Flakes.",
      "I talk it out.",
      "Need validation.",
      "Open with trust.",
      "Want peace and alignment."
    ]);

    expect(exchanges >= 12 && exchanges <= 16).toBe(true);
    assertNoBannedExploration(state);
    assertNoRepeatedQuestionTypeLoops(state);
    assertAllEightDimensionsExtracted(state);
    expect(state.completed).toBe(true);
  });

  it("acknowledges tangents then redirects forward without frustration loops", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      buildFetchMock([
        "That sounds frustrating. How did that make you feel?",
        "Can you tell me more about all of that?",
        "That's wild. Can you tell me more about your puppy first?",
        "Why do you think that happened?",
        "Did that affect your self-esteem?",
        "What did you learn from that?",
        "Got it."
      ])
    );

    const { state, sendReplies, exchanges } = await runScenario(
      "emergency-tangent",
      [
        "Dating feels chaotic lately.",
        "People flake and vanish.",
        "Also I got a new puppy and he chews everything.",
        "When conflict comes up I want to talk soon.",
        "When stressed I need someone to listen.",
        "I open up once I trust and I show love with acts and time.",
        "I want a safe relationship and better alignment next time."
      ]
    );

    const replyAfterTangent = sendReplies[2] ?? "";
    expect(BANNED_EXPLORATORY_PATTERN.test(replyAfterTangent)).toBe(false);
    expect(classifyQuestionType(replyAfterTangent)).not.toBe("exploratory");
    expect(replyAfterTangent.toLowerCase()).not.toContain("puppy");
    expect(exchanges >= 12 && exchanges <= 16).toBe(true);
    assertNoBannedExploration(state);
    assertNoRepeatedQuestionTypeLoops(state);
    assertAllEightDimensionsExtracted(state);
    expect(state.completed).toBe(true);
  });
});
