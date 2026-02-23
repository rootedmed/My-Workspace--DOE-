import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { normalizeLucyVariant, resolveLucyModelVersion, resolveLucyPromptVersion } from "@/lib/onboarding/lucy/experiments";
import { hasAllRequiredAnswers } from "@/lib/onboarding/lucy/extractors";
import type { LucySessionState } from "@/lib/onboarding/lucy/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type LucySessionRow = {
  user_id: string;
  session_id: string;
  current_stage: string;
  stage_states: unknown;
  messages: unknown;
  extracted_data: unknown;
  extraction_envelopes: unknown;
  control_flags: unknown;
  off_topic_total: number;
  off_topic_consecutive: number;
  quick_mode: boolean;
  completed: boolean;
  last_prompt_id: string | null;
  last_user_message_id: string | null;
  started_at: string;
  updated_at: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asNumberRecord(value: unknown): Partial<Record<string, number>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const out: Partial<Record<string, number>> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (typeof entry === "number" && Number.isFinite(entry)) {
      out[key] = entry;
    }
  }
  return out;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function asLucyFieldArray(
  value: unknown
): NonNullable<LucySessionState["control_flags"]["disputed_fields"]> {
  const valid = new Set([
    "past_attribution",
    "conflict_speed",
    "support_need",
    "emotional_openness",
    "love_expression",
    "relationship_vision",
    "relational_strengths",
    "growth_intention"
  ]);
  return asStringArray(value).filter(
    (entry): entry is NonNullable<LucySessionState["control_flags"]["disputed_fields"]>[number] =>
      valid.has(entry)
  );
}

function isLucyField(value: unknown): value is NonNullable<LucySessionState["control_flags"]["disputed_fields"]>[number] {
  return asLucyFieldArray([value]).length === 1;
}

function asTimeframeRecord(
  value: unknown
): Partial<Record<string, "past" | "current" | "desired">> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const out: Partial<Record<string, "past" | "current" | "desired">> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (entry === "past" || entry === "current" || entry === "desired") {
      out[key] = entry;
    }
  }
  return out;
}

function rowToState(row: LucySessionRow): LucySessionState {
  const control = asRecord(row.control_flags);
  const variant = normalizeLucyVariant(control.experiment_variant, row.user_id);
  const modelVersionRaw = typeof control.model_version === "string" ? control.model_version : null;
  const promptVersionRaw = typeof control.prompt_version === "string" ? control.prompt_version : null;
  return {
    user_id: row.user_id,
    session_id: row.session_id,
    current_stage: row.current_stage as LucySessionState["current_stage"],
    stage_states: asRecord(row.stage_states) as LucySessionState["stage_states"],
    messages: asArray(row.messages),
    extracted_data: asRecord(row.extracted_data) as LucySessionState["extracted_data"],
    extraction_envelopes: asRecord(row.extraction_envelopes) as LucySessionState["extraction_envelopes"],
    control_flags: {
      used_quick_mode: Boolean(control.used_quick_mode),
      needs_manual_review: Boolean(control.needs_manual_review),
      safety_flag: Boolean(control.safety_flag),
      contradiction_flag: Boolean(control.contradiction_flag),
      api_retry_count:
        typeof control.api_retry_count === "number" && Number.isFinite(control.api_retry_count)
          ? control.api_retry_count
          : 0,
      experiment_variant: variant,
      model_version: modelVersionRaw && modelVersionRaw.length > 0 ? modelVersionRaw : resolveLucyModelVersion(variant),
      prompt_version: promptVersionRaw && promptVersionRaw.length > 0 ? promptVersionRaw : resolveLucyPromptVersion(variant),
      understanding_mode:
        control.understanding_mode === "llm_first_v1" || control.understanding_mode === "rules_fallback"
          ? control.understanding_mode
          : undefined,
      last_understanding_source:
        control.last_understanding_source === "llm" || control.last_understanding_source === "rule"
          ? control.last_understanding_source
          : undefined,
      fallback_reason:
        control.fallback_reason === "llm_timeout" ||
        control.fallback_reason === "llm_invalid_json" ||
        control.fallback_reason === "llm_empty" ||
        control.fallback_reason === "none"
          ? control.fallback_reason
          : undefined,
      repeat_prompt_guard_hits:
        typeof control.repeat_prompt_guard_hits === "number" && Number.isFinite(control.repeat_prompt_guard_hits)
          ? control.repeat_prompt_guard_hits
          : 0,
      confirmation_loop_count:
        typeof control.confirmation_loop_count === "number" && Number.isFinite(control.confirmation_loop_count)
          ? control.confirmation_loop_count
          : 0,
      lead_field_jump_count:
        typeof control.lead_field_jump_count === "number" && Number.isFinite(control.lead_field_jump_count)
          ? control.lead_field_jump_count
          : 0,
      stale_pending_reset_count:
        typeof control.stale_pending_reset_count === "number" && Number.isFinite(control.stale_pending_reset_count)
          ? control.stale_pending_reset_count
          : 0,
      pending_confirmation_attempts:
        typeof control.pending_confirmation_attempts === "number" && Number.isFinite(control.pending_confirmation_attempts)
          ? control.pending_confirmation_attempts
          : 0,
      pending_confirmation_explained: Boolean(control.pending_confirmation_explained),
      unresolved_attempts: asNumberRecord(control.unresolved_attempts),
      last_llm_latency_ms:
        typeof control.last_llm_latency_ms === "number" && Number.isFinite(control.last_llm_latency_ms)
          ? control.last_llm_latency_ms
          : undefined,
      schema_validation_failed: Boolean(control.schema_validation_failed),
      provider_used_last_turn:
        control.provider_used_last_turn === "gemini" ||
        control.provider_used_last_turn === "groq" ||
        control.provider_used_last_turn === "openai" ||
        control.provider_used_last_turn === "openrouter" ||
        control.provider_used_last_turn === "none"
          ? control.provider_used_last_turn
          : "none",
      user_confusion_turn: Boolean(control.user_confusion_turn),
      challenge_detected_turn: Boolean(control.challenge_detected_turn),
      dispute_resolved_turn: Boolean(control.dispute_resolved_turn),
      stage_jump_after_dispute_turn: Boolean(control.stage_jump_after_dispute_turn),
      explanation_requested_turn: Boolean(control.explanation_requested_turn),
      topic_switch_detected_turn: Boolean(control.topic_switch_detected_turn),
      free_conversation_mode: Boolean(control.free_conversation_mode),
      free_extraction_phase:
        control.free_extraction_phase === "chat" ||
        control.free_extraction_phase === "extracting" ||
        control.free_extraction_phase === "followup" ||
        control.free_extraction_phase === "manual_gap_fill" ||
        control.free_extraction_phase === "ready_to_complete"
          ? control.free_extraction_phase
          : undefined,
      free_extraction_attempt_count:
        typeof control.free_extraction_attempt_count === "number" &&
        Number.isFinite(control.free_extraction_attempt_count)
          ? control.free_extraction_attempt_count
          : 0,
      free_followup_used: Boolean(control.free_followup_used),
      free_followup_pending: Boolean(control.free_followup_pending),
      free_missing_fields: asLucyFieldArray(control.free_missing_fields),
      free_manual_gap_field:
        isLucyField(control.free_manual_gap_field)
          ? control.free_manual_gap_field
          : undefined,
      free_low_signal_streak:
        typeof control.free_low_signal_streak === "number" &&
        Number.isFinite(control.free_low_signal_streak)
          ? control.free_low_signal_streak
          : 0,
      free_wrap_nudge_shown: Boolean(control.free_wrap_nudge_shown),
      free_coverage_score:
        typeof control.free_coverage_score === "number" &&
        Number.isFinite(control.free_coverage_score)
          ? control.free_coverage_score
          : 0,
      free_coverage_fields_estimated: asLucyFieldArray(control.free_coverage_fields_estimated),
      free_prompt_guard_hits:
        typeof control.free_prompt_guard_hits === "number" &&
        Number.isFinite(control.free_prompt_guard_hits)
          ? control.free_prompt_guard_hits
          : 0,
      free_prompt_guard_reason:
        control.free_prompt_guard_reason === "vague" ||
        control.free_prompt_guard_reason === "repeat" ||
        control.free_prompt_guard_reason === "missing_question" ||
        control.free_prompt_guard_reason === "none"
          ? control.free_prompt_guard_reason
          : "none",
      free_gemini_status:
        control.free_gemini_status === "ok" ||
        control.free_gemini_status === "retry_ok" ||
        control.free_gemini_status === "continued_ok" ||
        control.free_gemini_status === "timeout" ||
        control.free_gemini_status === "http_error" ||
        control.free_gemini_status === "empty" ||
        control.free_gemini_status === "network_error" ||
        control.free_gemini_status === "no_api_key" ||
        control.free_gemini_status === "none"
          ? control.free_gemini_status
          : "none",
      free_gemini_http_status:
        typeof control.free_gemini_http_status === "number" &&
        Number.isFinite(control.free_gemini_http_status) &&
        control.free_gemini_http_status >= 100 &&
        control.free_gemini_http_status <= 599
          ? Math.round(control.free_gemini_http_status)
          : undefined,
      free_gemini_finish_reason:
        typeof control.free_gemini_finish_reason === "string" &&
        control.free_gemini_finish_reason.trim().length > 0
          ? control.free_gemini_finish_reason.trim()
          : undefined,
      free_gemini_block_reason:
        typeof control.free_gemini_block_reason === "string" &&
        control.free_gemini_block_reason.trim().length > 0
          ? control.free_gemini_block_reason.trim()
          : undefined,
      free_gemini_error_code:
        typeof control.free_gemini_error_code === "string" &&
        control.free_gemini_error_code.trim().length > 0
          ? control.free_gemini_error_code.trim()
          : undefined,
      disputed_fields: asLucyFieldArray(control.disputed_fields),
      last_disputed_field:
        isLucyField(control.last_disputed_field)
          ? control.last_disputed_field
          : undefined,
      topic_thread_id: typeof control.topic_thread_id === "string" ? control.topic_thread_id : undefined,
      field_timeframe_tags: asTimeframeRecord(control.field_timeframe_tags) as LucySessionState["control_flags"]["field_timeframe_tags"],
      conversation_mode:
        control.conversation_mode === "rapport" ||
        control.conversation_mode === "explore" ||
        control.conversation_mode === "synthesis" ||
        control.conversation_mode === "gap_fill" ||
        control.conversation_mode === "closing"
          ? control.conversation_mode
          : undefined,
      synthesis_presented: Boolean(control.synthesis_presented),
      pending_confirmation_field:
        typeof control.pending_confirmation_field === "string"
          ? (control.pending_confirmation_field as LucySessionState["control_flags"]["pending_confirmation_field"])
          : undefined,
      pending_confirmation_value: control.pending_confirmation_value,
      pending_confirmation_confidence:
        typeof control.pending_confirmation_confidence === "number" && Number.isFinite(control.pending_confirmation_confidence)
          ? control.pending_confirmation_confidence
          : undefined,
      pending_confirmation_question:
        typeof control.pending_confirmation_question === "string" ? control.pending_confirmation_question : undefined,
      pending_contradiction_prompt:
        typeof control.pending_contradiction_prompt === "string" ? control.pending_contradiction_prompt : undefined,
      contradiction_prompted_keys: asStringArray(control.contradiction_prompted_keys),
      awaiting_edit_stage: Boolean(control.awaiting_edit_stage)
    },
    off_topic_total: Number(row.off_topic_total ?? 0),
    off_topic_consecutive: Number(row.off_topic_consecutive ?? 0),
    quick_mode: Boolean(row.quick_mode),
    completed: Boolean(row.completed),
    last_prompt_id: row.last_prompt_id,
    last_user_message_id: row.last_user_message_id,
    started_at: row.started_at,
    updated_at: row.updated_at
  };
}

function stateToPayload(state: LucySessionState): Record<string, unknown> {
  return {
    user_id: state.user_id,
    session_id: state.session_id,
    current_stage: state.current_stage,
    stage_states: state.stage_states,
    messages: state.messages,
    extracted_data: state.extracted_data,
    extraction_envelopes: state.extraction_envelopes,
    control_flags: state.control_flags,
    off_topic_total: state.off_topic_total,
    off_topic_consecutive: state.off_topic_consecutive,
    quick_mode: state.quick_mode,
    completed: state.completed,
    last_prompt_id: state.last_prompt_id,
    last_user_message_id: state.last_user_message_id,
    started_at: state.started_at,
    updated_at: state.updated_at
  };
}

/**
 * Test helper: exercises the same serialization + hydration code path used by DB persistence.
 * This catches dropped/renamed fields in control_flags and other mapped state.
 */
export function roundTripLucyStateForTest(state: LucySessionState): LucySessionState {
  return rowToState(stateToPayload(state) as LucySessionRow);
}

function hasRequiredControlFlagMetadata(state: LucySessionState): boolean {
  return Boolean(
    state.control_flags.experiment_variant &&
      state.control_flags.model_version &&
      state.control_flags.prompt_version
  );
}

export async function getLucySession(userId: string): Promise<LucySessionState | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("lucy_onboarding_sessions")
    .select(
      "user_id, session_id, current_stage, stage_states, messages, extracted_data, extraction_envelopes, control_flags, off_topic_total, off_topic_consecutive, quick_mode, completed, last_prompt_id, last_user_message_id, started_at, updated_at"
    )
    .eq("user_id", userId)
    .maybeSingle();

  return data ? rowToState(data as LucySessionRow) : null;
}

export async function ensureLucySession(userId: string): Promise<LucySessionState> {
  const existing = await getLucySession(userId);
  if (existing) {
    if (!hasRequiredControlFlagMetadata(existing)) {
      const variant = normalizeLucyVariant(existing.control_flags.experiment_variant, existing.user_id);
      const enriched: LucySessionState = {
        ...existing,
        control_flags: {
          ...existing.control_flags,
          experiment_variant: variant,
          model_version: existing.control_flags.model_version || resolveLucyModelVersion(variant),
          prompt_version: existing.control_flags.prompt_version || resolveLucyPromptVersion(variant)
        }
      };
      await saveLucySession(enriched);
      return enriched;
    }
    return existing;
  }

  const seed = createInitialLucySession(userId);
  await saveLucySession(seed);
  return seed;
}

export async function saveLucySession(state: LucySessionState): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.from("lucy_onboarding_sessions").upsert(stateToPayload(state), { onConflict: "user_id" });
  await syncLegacyOnboardingProgress(state);
}

function toLegacyStep(state: LucySessionState): number {
  if (state.completed) return 9;
  const requiredKeys = [
    "past_attribution",
    "conflict_speed",
    "support_need",
    "emotional_openness",
    "love_expression",
    "relationship_vision",
    "relational_strengths",
    "growth_intention"
  ] as const;
  const completed = requiredKeys.filter((key) => {
    const value = state.extracted_data[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null;
  }).length;
  return Math.min(9, Math.max(1, completed + 1));
}

async function syncLegacyOnboardingProgress(state: LucySessionState): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const step = toLegacyStep(state);
  const completed = hasAllRequiredAnswers(state.extracted_data) && state.completed;
  const now = new Date().toISOString();

  await Promise.all([
    supabase
      .from("onboarding_drafts")
      .upsert(
        {
          user_id: state.user_id,
          answers: state.extracted_data,
          updated_at: now
        },
        { onConflict: "user_id" }
      )
      .select("user_id")
      .single(),
    supabase
      .from("onboarding_progress")
      .upsert(
        {
          user_id: state.user_id,
          current_step: step,
          completed,
          total_steps: 9,
          mode: "deep",
          updated_at: now
        },
        { onConflict: "user_id" }
      )
      .select("user_id")
      .single()
  ]);
}
