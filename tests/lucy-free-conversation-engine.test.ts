import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import {
  buildLucySessionViewFree,
  enableFreeConversationMode,
  processLucyFreeConversationAction
} from "@/lib/onboarding/lucy/freeConversationEngine";
import type { LucySessionState } from "@/lib/onboarding/lucy/types";

function geminiTextResponse(text: string, finishReason?: string): Response {
  const candidate = finishReason
    ? { finishReason, content: { parts: [{ text }] } }
    : { content: { parts: [{ text }] } };
  return new Response(
    JSON.stringify({
      candidates: [candidate]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function geminiErrorResponse(status = 500): Response {
  return new Response(JSON.stringify({ error: "temporary" }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function geminiRateLimitedResponse(): Response {
  return new Response(
    JSON.stringify({
      error: {
        status: "RESOURCE_EXHAUSTED",
        message: "quota exhausted"
      }
    }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

function groqTextResponse(text: string, finishReason = "stop"): Response {
  return new Response(
    JSON.stringify({
      choices: [{ finish_reason: finishReason, message: { content: text } }]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function geminiBlockedResponse(blockReason = "SAFETY"): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ finishReason: "SAFETY" }],
      promptFeedback: { blockReason }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

function seedStateWithUserTurns(turns: number): LucySessionState {
  const seeded = enableFreeConversationMode(createInitialLucySession("free-user-1"));
  const messages = [...seeded.messages];
  for (let index = 0; index < turns; index += 1) {
    messages.push({
      id: `u-${index}`,
      role: "user",
      content: `User story ${index}`,
      created_at: new Date().toISOString(),
      stage_id: "opening"
    });
    messages.push({
      id: `a-${index}`,
      role: "assistant",
      content: `Assistant reply ${index}`,
      created_at: new Date().toISOString(),
      stage_id: "opening"
    });
  }
  return {
    ...seeded,
    messages
  };
}

function fullExtractionPayload(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    past_attribution: { answer: "conflict_comm", confidence: "high", quote: "we kept fighting and could not repair" },
    conflict_speed: { answer: "2", confidence: "medium", quote: "i cool down and then talk soon after" },
    support_need: { answer: "validation", confidence: "high", quote: "i need to feel heard" },
    emotional_openness: { answer: "3", confidence: "medium", quote: "i am mixed depending on trust" },
    love_expression: { answer: ["time", "words"], confidence: "high", quote: "i show up with time and words" },
    relationship_vision: { answer: "friendship", confidence: "high", quote: "i want best friend energy" },
    relational_strengths: { answer: ["consistency", "honesty"], confidence: "high", quote: "i am consistent and honest" },
    growth_intention: { answer: "alignment", confidence: "high", quote: "i want better alignment this time" },
    ...overrides
  };
}

describe("Lucy free conversation engine", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
  });

  it("uses Gemini reply directly in free mode chat", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => geminiTextResponse("That sounds rough. What part felt most discouraging for you?"));
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-reply"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "Dating has been rough lately.",
      clientMessageId: "free-1"
    });

    const reply = next.messages.at(-1)?.content ?? "";
    expect(reply).toContain("That sounds rough.");
    expect(reply).toMatch(/\?$/);
    expect(reply.toLowerCase()).not.toContain("how did that make you feel");
    expect(next.control_flags.free_gemini_status).toBe("ok");
    expect(next.control_flags.provider_used_last_turn).toBe("gemini");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a minimal free-chat prompt without runtime steering metadata blocks", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => geminiTextResponse("Makes sense. What does a healthy relationship look like to you day-to-day?"));
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-minimal-prompt"));
    await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "not great",
      clientMessageId: "free-minimal-prompt-1"
    });

    const firstCall = fetchMock.mock.calls[0] as unknown[] | undefined;
    const requestInit = firstCall?.[1] as RequestInit | undefined;
    const rawBody = typeof requestInit?.body === "string" ? requestInit.body : "";

    expect(rawBody).toContain("Conversation history (most recent last):");
    expect(rawBody).toContain("Latest user message: not great");
    expect(rawBody).not.toContain("Runtime steering context");
    expect(rawBody).not.toContain("dialogue_phase");
    expect(rawBody).not.toContain("question_required");
    expect(rawBody).not.toContain("confidence_by_field");
  });

  it("rewrites banned exploratory questions to a forward-moving bridge question", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () =>
      geminiTextResponse("That sucks. How did that make you feel when they canceled?")
    );
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-guard-banned"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "I keep getting flaked on.",
      clientMessageId: "free-guard-banned-1"
    });

    const reply = next.messages.at(-1)?.content ?? "";
    expect(reply.toLowerCase()).not.toContain("how did that make you feel");
    expect(reply).toMatch(/\?$/);
    expect(/core pattern|main thing that kept breaking|when life stress spikes|healthy relationship/i.test(reply)).toBe(
      true
    );
    expect(["vague", "style"]).toContain(next.control_flags.free_prompt_guard_reason);
  });

  it("rewrites repeated question types to the next uncovered priority dimension", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () =>
      geminiTextResponse("Got it. When conflict starts, what do you do first: lean in quickly or step back a bit?")
    );
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-guard-repeat"));
    const seededHistory: LucySessionState = {
      ...seed,
      messages: [
        ...seed.messages,
        {
          id: "assistant-conflict-prior",
          role: "assistant",
          content: "When tension hits, are you more talk-it-through-now or space-first?",
          created_at: new Date().toISOString(),
          stage_id: "opening",
          kind: "normal"
        }
      ]
    };

    const next = await processLucyFreeConversationAction(seededHistory, {
      action: "send",
      message: "I open up slowly once I trust someone.",
      clientMessageId: "free-guard-repeat-1"
    });

    const reply = next.messages.at(-1)?.content ?? "";
    expect(/tension|conflict starts|space-first/i.test(reply)).toBe(false);
    expect(reply).toMatch(/\?$/);
    expect(next.control_flags.free_prompt_guard_reason).toBe("repeat");
  });

  it("retries once when Gemini fails transiently", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => geminiErrorResponse(500))
      .mockImplementationOnce(async () => geminiTextResponse("Got it. What would feel different if this went well?"));
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-retry"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "I might try dating again.",
      clientMessageId: "free-2"
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(next.messages.at(-1)?.content).toMatch(/\?$/);
    expect(["ok", "retry_ok"]).toContain(next.control_flags.free_gemini_status);
    expect(next.control_flags.provider_used_last_turn).toBe("gemini");
  });

  it("fails over to Groq when Gemini is rate-limited", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GROQ_API_KEY = "groq-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("api.groq.com")) {
        return groqTextResponse("That sounds exhausting. What would make you feel taken seriously this time?");
      }
      return geminiRateLimitedResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-failover"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "Dating has been exhausting.",
      clientMessageId: "free-failover-1"
    });

    expect(next.messages.at(-1)?.content).toMatch(/\?$/);
    expect(next.messages.at(-1)?.content.toLowerCase()).not.toContain("can you tell me more");
    expect(next.control_flags.provider_used_last_turn).toBe("groq");
    expect(next.control_flags.free_gemini_status).toBe("retry_ok");
    expect(next.control_flags.free_gemini_http_status).toBe(200);
  });

  it("falls back to a provider-issue notice when Gemini is unavailable", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => geminiErrorResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-fallback"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "I took a break and now I feel unsure.",
      clientMessageId: "free-3"
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(next.messages.at(-1)?.content.toLowerCase()).toContain("connection issue");
    expect(next.control_flags.free_gemini_status).toBe("http_error");
    expect(next.control_flags.provider_used_last_turn).toBe("none");
    expect(next.control_flags.free_gemini_http_status).toBe(500);
    expect(next.control_flags.fallback_reason).toBe("llm_empty");
  });

  it("uses the same provider-issue notice on repeated Gemini outages", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => geminiErrorResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    let state = enableFreeConversationMode(createInitialLucySession("free-user-no-loop"));
    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "Its been ups and downs. Mainly downs. But im hoping for an up",
      clientMessageId: "free-loop-1"
    });
    const firstFallback = state.messages.at(-1)?.content ?? "";

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "Its been ups and downs. Mainly downs. But im hoping for an up",
      clientMessageId: "free-loop-2"
    });
    const secondFallback = state.messages.at(-1)?.content ?? "";

    expect(firstFallback.toLowerCase()).toContain("connection issue");
    expect(secondFallback.toLowerCase()).toContain("connection issue");
    expect(secondFallback).toBe(firstFallback);
    expect(state.control_flags.free_gemini_status).toBe("http_error");
  });

  it("continues once when Gemini returns MAX_TOKENS and merges the reply", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        geminiTextResponse("Oh, that sounds really tough. Feeling mostly downs can", "MAX_TOKENS")
      )
      .mockImplementationOnce(async () =>
        geminiTextResponse("really wear you down. What has felt most disappointing lately?")
      );
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-cutoff"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "Its been rough. Ups and downs, but mostly downs",
      clientMessageId: "free-cutoff-1"
    });

    const reply = next.messages.at(-1)?.content ?? "";
    expect(reply).toContain("Oh, that sounds really tough.");
    expect(reply).toMatch(/\?$/);
    expect(next.control_flags.free_gemini_status).toBe("continued_ok");
    expect(next.control_flags.provider_used_last_turn).toBe("gemini");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to provider-issue notice when continuation after MAX_TOKENS fails", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () =>
        geminiTextResponse("Oh, that sounds really tough. Feeling mostly downs can", "MAX_TOKENS")
      )
      .mockImplementationOnce(async () => geminiErrorResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-cutoff-fail"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "Its been rough. Ups and downs, but mostly downs",
      clientMessageId: "free-cutoff-2"
    });

    const reply = next.messages.at(-1)?.content ?? "";
    expect(reply.toLowerCase()).toContain("connection issue");
    expect(["http_error", "network_error", "empty"]).toContain(next.control_flags.free_gemini_status);
    expect(next.control_flags.provider_used_last_turn).toBe("none");
  });

  it("uses rephrase notice and captures block reason when Gemini blocks content", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => geminiBlockedResponse("SAFETY"));
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-blocked"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "Their dating behavior is trash",
      clientMessageId: "free-blocked-1"
    });

    const reply = next.messages.at(-1)?.content ?? "";
    expect(reply.toLowerCase()).toContain("rephrase");
    expect(next.control_flags.free_gemini_status).toBe("empty");
    expect(next.control_flags.free_gemini_finish_reason).toBe("SAFETY");
    expect(next.control_flags.free_gemini_block_reason).toBe("SAFETY");
    expect(next.control_flags.free_gemini_error_code).toBeUndefined();
  });

  it("handles safety cues before Gemini generation", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => geminiTextResponse("unused"));
    vi.stubGlobal("fetch", fetchMock);

    const seed = enableFreeConversationMode(createInitialLucySession("free-user-safety"));
    const next = await processLucyFreeConversationAction(seed, {
      action: "send",
      message: "I want to hurt myself",
      clientMessageId: "free-4"
    });

    expect(next.control_flags.safety_flag).toBe(true);
    expect(next.messages.at(-1)?.kind).toBe("safety");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires at least 5 user turns before finish extraction", async () => {
    const seed = seedStateWithUserTurns(3);
    const next = await processLucyFreeConversationAction(seed, {
      action: "finish"
    });

    expect(next.completed).toBe(false);
    expect(next.messages.at(-1)?.content.toLowerCase()).toContain("little more context");
  });

  it("extracts all required fields in one pass and marks session complete", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => geminiTextResponse(JSON.stringify(fullExtractionPayload())));
    vi.stubGlobal("fetch", fetchMock);

    const seed = seedStateWithUserTurns(5);
    const next = await processLucyFreeConversationAction(seed, {
      action: "finish"
    });
    const view = buildLucySessionViewFree(next);

    expect(next.completed).toBe(true);
    expect(next.control_flags.free_extraction_phase).toBe("ready_to_complete");
    expect(next.extracted_data.past_attribution).toBe("conflict_comm");
    expect(next.extracted_data.support_need).toBe("validation");
    expect(view.canSubmit).toBe(true);
  });

  it("falls over to Groq for finish-time extraction when Gemini is rate-limited", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GROQ_API_KEY = "groq-key";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("api.groq.com")) {
        return groqTextResponse(JSON.stringify(fullExtractionPayload()));
      }
      return geminiRateLimitedResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    const seed = seedStateWithUserTurns(5);
    const next = await processLucyFreeConversationAction(seed, {
      action: "finish"
    });
    const view = buildLucySessionViewFree(next);

    expect(next.completed).toBe(true);
    expect(next.control_flags.free_extraction_phase).toBe("ready_to_complete");
    expect(next.extracted_data.past_attribution).toBe("conflict_comm");
    expect(view.canSubmit).toBe(true);
  });

  it("does one follow-up extraction pass, then falls back to manual quick picks", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const fetchMock = vi.fn(async () => {
      if (fetchMock.mock.calls.length === 1) {
        return geminiTextResponse(
          JSON.stringify(
            fullExtractionPayload({
              support_need: { answer: "NOT_COVERED", confidence: "low", quote: "" }
            })
          )
        );
      }
      return geminiTextResponse(
        JSON.stringify(
          fullExtractionPayload({
            support_need: { answer: "NOT_COVERED", confidence: "low", quote: "" }
          })
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    let state = seedStateWithUserTurns(5);
    state = await processLucyFreeConversationAction(state, { action: "finish" });

    expect(state.control_flags.free_extraction_phase).toBe("followup");
    expect(state.control_flags.free_followup_pending).toBe(true);

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "When stressed I need to be heard."
    });
    expect(state.control_flags.free_extraction_phase).toBe("manual_gap_fill");
    expect(state.control_flags.free_manual_gap_field).toBe("support_need");

    state = await processLucyFreeConversationAction(state, {
      action: "send",
      message: "validation"
    });

    expect(state.extracted_data.support_need).toBe("validation");
    expect(state.completed).toBe(true);
    expect(state.control_flags.free_extraction_phase).toBe("ready_to_complete");
  });
});
