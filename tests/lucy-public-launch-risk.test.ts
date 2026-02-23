import { beforeEach, describe, expect, it, vi } from "vitest";
import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import type { LucyMessage, LucySessionState } from "@/lib/onboarding/lucy/types";
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

function assistantMessages(state: LucySessionState): LucyMessage[] {
  return state.messages.filter((message) => message.role === "assistant");
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

describe("Lucy public-launch risk taxonomy guards", () => {
  beforeEach(() => {
    understandTurnMock.mockReset();
    understandTurnMock.mockResolvedValue(emptyUnderstanding());
  });

  it("does not commit past_attribution from affect-only opener", async () => {
    let state = createInitialLucySession("risk-user-1");
    state = await processLucyUserMessageConversational(
      state,
      "it's rough and lonely out here",
      "risk-1"
    );

    expect(state.extracted_data.past_attribution).toBeUndefined();
    expect(state.extraction_envelopes.past_attribution?.confidence ?? 0).toBeLessThan(70);
  });

  it("handles EN/ES code-switch for commitment mismatch", async () => {
    let state = createInitialLucySession("risk-user-2");
    state = await processLucyUserMessageConversational(state, "yes", "risk-2-1");
    state = await processLucyUserMessageConversational(
      state,
      "estoy cansada de situaciones sin etiquetas, quiero algo serio",
      "risk-2-2"
    );

    expect(state.extracted_data.past_attribution).toBe("misaligned_goals");
    expect((state.extraction_envelopes.past_attribution?.confidence ?? 0) >= 80).toBe(true);
  });

  it("does not directly project partner conflict behavior as user conflict style", async () => {
    let state = createInitialLucySession("risk-user-3");
    state = await processLucyUserMessageConversational(state, "yes", "risk-3-1");
    state = await processLucyUserMessageConversational(
      state,
      "my ex would go silent for days after fights",
      "risk-3-2"
    );

    expect(state.extracted_data.past_attribution).toBe("conflict_comm");
    expect(state.extraction_envelopes.conflict_speed?.confidence ?? 0).toBeLessThan(60);
  });

  it("tracks desired timeframe tags from forward-looking statements", async () => {
    let state = createInitialLucySession("risk-user-4");
    state = await processLucyUserMessageConversational(state, "yes", "risk-4-1");
    state = await processLucyUserMessageConversational(
      state,
      "i used to be guarded, now i'm more open. next time i want deeper honesty",
      "risk-4-2"
    );

    expect(state.control_flags.field_timeframe_tags?.growth_intention).toBe("desired");
  });

  it("rolls back disputed inference and records dispute telemetry flags", async () => {
    understandTurnMock.mockReset();
    understandTurnMock
      .mockResolvedValueOnce({
        source: "llm",
        fallback_reason: "none",
        provider_used: "openai",
        llm_latency_ms: 110,
        schema_validation_failed: false,
        understanding: {
          assistant_reply: "I hear that this has felt hard lately.",
          signals: [
            {
              field: "past_attribution",
              value: "misaligned_goals",
              confidence: 70,
              evidence: "keep making the wrong move",
              source: "llm",
              speaker_scope: "self",
              timeframe: "current"
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
      .mockResolvedValue(emptyUnderstanding());

    let state = createInitialLucySession("risk-user-5");
    state = await processLucyUserMessageConversational(
      state,
      "it feels like i keep making the wrong move",
      "risk-5-1"
    );
    state = await processLucyUserMessageConversational(state, "how did you get there", "risk-5-2");

    expect(state.extracted_data.past_attribution).toBeUndefined();
    expect(state.control_flags.challenge_detected_turn).toBe(true);
    expect(state.control_flags.dispute_resolved_turn).toBe(true);
    expect(state.control_flags.disputed_fields).toContain("past_attribution");
    expect(state.control_flags.last_disputed_field).toBe("past_attribution");
  });

  it("clears stale pending confirmation when user switches topic", async () => {
    let state = createInitialLucySession("risk-user-6");
    state = await processLucyUserMessageConversational(state, "yes", "risk-6-1");
    state = {
      ...state,
      control_flags: {
        ...state.control_flags,
        pending_confirmation_field: "emotional_openness",
        pending_confirmation_value: 3,
        pending_confirmation_confidence: 70,
        pending_confirmation_question: "I’m hearing your emotional openness as 3/5. Does that sound right?"
      }
    };

    state = await processLucyUserMessageConversational(
      state,
      "when i'm stressed i need space first",
      "risk-6-2"
    );

    expect(state.control_flags.pending_confirmation_field).not.toBe("emotional_openness");
    expect(state.control_flags.topic_switch_detected_turn).toBe(true);
    expect((state.control_flags.stale_pending_reset_count ?? 0) >= 1).toBe(true);
  });

  it("handles external action requests with boundary and returns to onboarding", async () => {
    let state = createInitialLucySession("risk-user-7");
    state = await processLucyUserMessageConversational(state, "yes", "risk-7-1");
    state = await processLucyUserMessageConversational(
      state,
      "go to amazon and order flowers for me",
      "risk-7-2"
    );

    const last = assistantMessages(state).at(-1);
    expect(last?.kind).toBe("redirect");
    expect(last?.content.toLowerCase()).toContain("can’t perform external actions");
  });

  it("does not repeat identical assistant lines across long-tail acknowledgments", async () => {
    let state = createInitialLucySession("risk-user-8");
    const turns = [
      "yes",
      "dating is rough",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok",
      "ok"
    ];

    for (let index = 0; index < turns.length; index += 1) {
      state = await processLucyUserMessageConversational(state, turns[index]!, `risk-8-${index + 1}`);
    }

    const duplicates = duplicateAssistantReplies(assistantMessages(state));
    expect(duplicates).toBe(0);
  });
});
