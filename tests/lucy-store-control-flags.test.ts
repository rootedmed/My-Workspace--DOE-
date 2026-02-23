import { describe, expect, it, vi } from "vitest";
import { getLucySession } from "@/lib/onboarding/lucy/store";

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: fromMock
  }))
}));

describe("Lucy store control flag hydration", () => {
  it("preserves contradiction_prompted_keys when loading session state", async () => {
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        user_id: "user-1",
        session_id: "session-1",
        current_stage: "growth_intention",
        stage_states: {},
        messages: [],
        extracted_data: {},
        extraction_envelopes: {},
        control_flags: {
          used_quick_mode: false,
          needs_manual_review: false,
          safety_flag: false,
          contradiction_flag: true,
          api_retry_count: 0,
          experiment_variant: "control_a",
          model_version: "rules-v1",
          prompt_version: "structured-v1",
          free_conversation_mode: true,
          free_extraction_phase: "chat",
          free_extraction_attempt_count: 1,
          free_followup_used: false,
          free_followup_pending: false,
          free_missing_fields: ["support_need"],
          free_manual_gap_field: "support_need",
          free_low_signal_streak: 2,
          free_wrap_nudge_shown: true,
          free_coverage_score: 75,
          free_coverage_fields_estimated: [
            "past_attribution",
            "conflict_speed",
            "support_need",
            "emotional_openness",
            "relationship_vision",
            "growth_intention"
          ],
          free_prompt_guard_hits: 3,
          free_prompt_guard_reason: "vague",
          free_gemini_status: "continued_ok",
          free_gemini_http_status: 200,
          free_gemini_finish_reason: "STOP",
          free_gemini_block_reason: "",
          free_gemini_error_code: "",
          contradiction_prompted_keys: ["openness_growth:4:depth"],
          disputed_fields: ["past_attribution"],
          last_disputed_field: "past_attribution",
          topic_thread_id: "past_attribution",
          field_timeframe_tags: {
            growth_intention: "desired"
          },
          challenge_detected_turn: true,
          dispute_resolved_turn: true,
          stage_jump_after_dispute_turn: false,
          explanation_requested_turn: false,
          topic_switch_detected_turn: true,
          pending_contradiction_prompt:
            "Quick check: you described a private style, and also wanting deeper honesty. Is that a growth goal for you right now?"
        },
        off_topic_total: 0,
        off_topic_consecutive: 0,
        quick_mode: false,
        completed: false,
        last_prompt_id: null,
        last_user_message_id: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    });

    const state = await getLucySession("user-1");

    expect(state).not.toBeNull();
    expect(state?.control_flags.free_conversation_mode).toBe(true);
    expect(state?.control_flags.free_extraction_phase).toBe("chat");
    expect(state?.control_flags.free_extraction_attempt_count).toBe(1);
    expect(state?.control_flags.free_followup_used).toBe(false);
    expect(state?.control_flags.free_followup_pending).toBe(false);
    expect(state?.control_flags.free_missing_fields).toEqual(["support_need"]);
    expect(state?.control_flags.free_manual_gap_field).toBe("support_need");
    expect(state?.control_flags.free_low_signal_streak).toBe(2);
    expect(state?.control_flags.free_wrap_nudge_shown).toBe(true);
    expect(state?.control_flags.free_coverage_score).toBe(75);
    expect(state?.control_flags.free_coverage_fields_estimated).toEqual([
      "past_attribution",
      "conflict_speed",
      "support_need",
      "emotional_openness",
      "relationship_vision",
      "growth_intention"
    ]);
    expect(state?.control_flags.free_prompt_guard_hits).toBe(3);
    expect(state?.control_flags.free_prompt_guard_reason).toBe("vague");
    expect(state?.control_flags.free_gemini_status).toBe("continued_ok");
    expect(state?.control_flags.free_gemini_http_status).toBe(200);
    expect(state?.control_flags.free_gemini_finish_reason).toBe("STOP");
    expect(state?.control_flags.free_gemini_block_reason).toBeUndefined();
    expect(state?.control_flags.free_gemini_error_code).toBeUndefined();
    expect(state?.control_flags.pending_contradiction_prompt).toContain("private style");
    expect(state?.control_flags.contradiction_prompted_keys).toEqual(["openness_growth:4:depth"]);
    expect(state?.control_flags.disputed_fields).toEqual(["past_attribution"]);
    expect(state?.control_flags.last_disputed_field).toBe("past_attribution");
    expect(state?.control_flags.topic_thread_id).toBe("past_attribution");
    expect(state?.control_flags.field_timeframe_tags?.growth_intention).toBe("desired");
    expect(state?.control_flags.challenge_detected_turn).toBe(true);
    expect(state?.control_flags.dispute_resolved_turn).toBe(true);
    expect(state?.control_flags.topic_switch_detected_turn).toBe(true);
  });
});
