import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isValidCsrf } from "@/lib/security/csrf";
import { applyRateLimit, getRequestIp } from "@/lib/security/rateLimit";
import { assertWriteAllowed } from "@/lib/config/env.server";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";
import { buildLucySessionView, processLucyUserMessage, switchLucyQuickMode } from "@/lib/onboarding/lucy/engine";
import {
  buildLucySessionViewFree,
  enableFreeConversationMode,
  processLucyFreeConversationAction
} from "@/lib/onboarding/lucy/freeConversationEngine";
import { resolveLucyOnboardingEngine } from "@/lib/onboarding/lucy/freeMode";
import { ensureLucySession, saveLucySession } from "@/lib/onboarding/lucy/store";
import type { LucyAnswerField, LucyMessage, LucySessionState } from "@/lib/onboarding/lucy/types";
import { logStructured } from "@/lib/observability/logger";

const payloadSchema = z.object({
  message: z.string().trim().max(2000).optional(),
  clientMessageId: z.string().trim().min(1).max(100).optional(),
  action: z.enum(["send", "switch_quick_mode", "finish"]).default("send")
});

function latestAssistantMessage(state: LucySessionState): LucyMessage | null {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message?.role === "assistant") {
      return message;
    }
  }
  return null;
}

function confidenceBucket(confidence: number): "high" | "medium" | "low" {
  if (confidence >= 80) return "high";
  if (confidence >= 60) return "medium";
  return "low";
}

function signalTypeFromSource(source: "chat" | "quick_mode" | "inferred"): string {
  if (source === "quick_mode") return "direct_self_statement";
  if (source === "inferred") return "meta_signal";
  return "story_inference";
}

function baseEventContext(state: LucySessionState) {
  return {
    variant: state.control_flags.experiment_variant,
    turn_number: state.messages.filter((message) => message.role === "user").length,
    stage_or_thread: state.control_flags.topic_thread_id ?? state.current_stage,
    session_id: state.session_id,
    model_version: state.control_flags.model_version,
    prompt_version: state.control_flags.prompt_version,
    understanding_source: state.control_flags.last_understanding_source ?? "rule",
    fallback_reason: state.control_flags.fallback_reason ?? "none",
    provider_used: state.control_flags.provider_used_last_turn ?? "none",
    llm_latency_ms: state.control_flags.last_llm_latency_ms ?? null,
    schema_validation_failed: state.control_flags.schema_validation_failed ?? false,
    user_confusion_turn: state.control_flags.user_confusion_turn ?? false,
    challenge_detected: state.control_flags.challenge_detected_turn ?? false,
    dispute_resolved: state.control_flags.dispute_resolved_turn ?? false,
    stage_jump_after_dispute: state.control_flags.stage_jump_after_dispute_turn ?? false,
    explanation_requested: state.control_flags.explanation_requested_turn ?? false,
    topic_switch_detected: state.control_flags.topic_switch_detected_turn ?? false,
    pending_confirmation_attempts: state.control_flags.pending_confirmation_attempts ?? 0,
    confirmation_loop_count: state.control_flags.confirmation_loop_count ?? 0,
    lead_field_jump_count: state.control_flags.lead_field_jump_count ?? 0,
    stale_pending_reset_count: state.control_flags.stale_pending_reset_count ?? 0
  };
}

export async function POST(request: Request) {
  try {
    assertWriteAllowed();
  } catch {
    return NextResponse.json({ error: "Preview is read-only." }, { status: 503 });
  }

  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureAppUser({ id: user.id, email: user.email, firstName: user.firstName }).catch(() => undefined);

  const limit = applyRateLimit({
    key: `onboarding-lucy-message:${getRequestIp(request)}:${user.id}`,
    max: 120,
    windowMs: 10 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many messages. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const payloadRaw = await request.json().catch(() => null);
  const payload = payloadSchema.safeParse(payloadRaw);
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid payload", details: payload.error.flatten() }, { status: 400 });
  }

  const existing = await ensureLucySession(user.id);
  const startedAtMs = Date.now();
  const resolvedEngine = resolveLucyOnboardingEngine();
  const freeConversationEnabled = resolvedEngine === "free_chat";
  const existingForMode = freeConversationEnabled ? enableFreeConversationMode(existing) : existing;

  if (!freeConversationEnabled && payload.data.action === "finish") {
    return NextResponse.json({ error: "Finish action is not available in this mode." }, { status: 400 });
  }

  const nextState =
    freeConversationEnabled
      ? await processLucyFreeConversationAction(existingForMode, {
          action: payload.data.action,
          message: payload.data.message ?? "",
          clientMessageId: payload.data.clientMessageId
        })
      : payload.data.action === "switch_quick_mode"
        ? switchLucyQuickMode(existingForMode)
        : processLucyUserMessage(existingForMode, payload.data.message ?? "", payload.data.clientMessageId);

  await saveLucySession(nextState);
  const latencyMs = Date.now() - startedAtMs;

  if (freeConversationEnabled) {
    const previousView = buildLucySessionViewFree(existingForMode);
    const nextView = buildLucySessionViewFree(nextState);
    const extractionPhase = nextState.control_flags.free_extraction_phase ?? "chat";
    const geminiStatus = nextState.control_flags.free_gemini_status ?? "none";
    const providerUsed = nextState.control_flags.provider_used_last_turn ?? "none";
    const geminiHttpStatus = nextState.control_flags.free_gemini_http_status ?? null;
    const geminiFinishReason = nextState.control_flags.free_gemini_finish_reason ?? null;
    const geminiBlockReason = nextState.control_flags.free_gemini_block_reason ?? null;
    const geminiErrorCode = nextState.control_flags.free_gemini_error_code ?? null;
    const turnNumber = nextView.telemetry?.turn_number ?? 0;
    const guardReason = nextState.control_flags.free_prompt_guard_reason ?? "none";
    const roboticPatternHit = nextState.control_flags.free_robotic_pattern_hit_last_turn ?? false;
    const preGuardRepeatTypeHit = nextState.control_flags.free_pre_guard_repeat_type_hit_last_turn ?? false;

    logStructured("info", "lucy_free_turn_processed", {
      user_id: user.id,
      action: payload.data.action,
      latency_ms: latencyMs,
      extraction_phase: extractionPhase,
      turn_number: turnNumber,
      provider_used: providerUsed,
      gemini_status: geminiStatus,
      gemini_http_status: geminiHttpStatus,
      gemini_finish_reason: geminiFinishReason,
      gemini_block_reason: geminiBlockReason,
      gemini_error_code: geminiErrorCode,
      guard_reason: guardReason,
      robotic_pattern_hit: roboticPatternHit,
      pre_guard_repeat_type_hit: preGuardRepeatTypeHit,
      session_id: nextState.session_id
    });

    if (payload.data.action === "finish") {
      logStructured("info", "lucy_final_extraction_run", {
        user_id: user.id,
        attempts: nextState.control_flags.free_extraction_attempt_count ?? 0,
        missing_fields_count: nextView.freeMode?.missingFields.length ?? 0,
        session_id: nextState.session_id
      });
    }

    if (
      previousView.freeMode?.extractionPhase !== "followup" &&
      nextView.freeMode?.extractionPhase === "followup"
    ) {
      logStructured("info", "lucy_final_extraction_followup_requested", {
        user_id: user.id,
        missing_fields_count: nextView.freeMode?.missingFields.length ?? 0,
        session_id: nextState.session_id
      });
    }

    if (
      previousView.freeMode?.extractionPhase !== "manual_gap_fill" &&
      nextView.freeMode?.extractionPhase === "manual_gap_fill"
    ) {
      logStructured("info", "lucy_manual_gap_fill_started", {
        user_id: user.id,
        field: nextState.control_flags.free_manual_gap_field ?? "unknown",
        missing_fields_count: nextView.freeMode?.missingFields.length ?? 0,
        session_id: nextState.session_id
      });
    }

    if (!previousView.canSubmit && nextView.canSubmit) {
      logStructured("info", "lucy_free_onboarding_ready_to_complete", {
        user_id: user.id,
        session_id: nextState.session_id
      });
    }

    return NextResponse.json({ session: nextView }, { status: 200 });
  }

  const lastAssistant = latestAssistantMessage(nextState);
  const ctx = baseEventContext(nextState);
  logStructured("info", "lucy_response_generated", {
    user_id: user.id,
    intent: lastAssistant?.kind ?? "normal",
    latency_ms: latencyMs,
    repeat_prompt_guard_triggered:
      (nextState.control_flags.repeat_prompt_guard_hits ?? 0) > (existing.control_flags.repeat_prompt_guard_hits ?? 0),
    ...ctx
  });

  if (!existing.control_flags.user_confusion_turn && nextState.control_flags.user_confusion_turn) {
    logStructured("info", "lucy_clarification_question_detected", {
      user_id: user.id,
      ...ctx
    });
  }

  if (!existing.control_flags.challenge_detected_turn && nextState.control_flags.challenge_detected_turn) {
    logStructured("info", "lucy_challenge_detected", {
      user_id: user.id,
      ...ctx
    });
  }

  if (!existing.control_flags.dispute_resolved_turn && nextState.control_flags.dispute_resolved_turn) {
    logStructured("info", "lucy_dispute_resolved", {
      user_id: user.id,
      disputed_field: nextState.control_flags.last_disputed_field ?? "unknown",
      ...ctx
    });
  }

  if (!existing.control_flags.explanation_requested_turn && nextState.control_flags.explanation_requested_turn) {
    logStructured("info", "lucy_explanation_requested", {
      user_id: user.id,
      ...ctx
    });
  }

  if (!existing.control_flags.topic_switch_detected_turn && nextState.control_flags.topic_switch_detected_turn) {
    logStructured("info", "lucy_topic_switch_detected", {
      user_id: user.id,
      topic_thread_id: nextState.control_flags.topic_thread_id ?? "unknown",
      ...ctx
    });
  }

  if (!existing.control_flags.stage_jump_after_dispute_turn && nextState.control_flags.stage_jump_after_dispute_turn) {
    logStructured("warn", "lucy_stage_jump_after_dispute", {
      user_id: user.id,
      disputed_field: nextState.control_flags.last_disputed_field ?? "unknown",
      ...ctx
    });
  }

  const nextEnvelopes = nextState.extraction_envelopes;
  const previousEnvelopes = existing.extraction_envelopes;
  for (const [field, envelope] of Object.entries(nextEnvelopes) as Array<[LucyAnswerField, NonNullable<LucySessionState["extraction_envelopes"][LucyAnswerField]>]>) {
    if (!envelope) continue;
    const previous = previousEnvelopes[field];
    if (JSON.stringify(previous) === JSON.stringify(envelope)) continue;
    logStructured("info", "lucy_signal_extracted", {
      user_id: user.id,
      field,
      confidence_bucket: confidenceBucket(envelope.confidence),
      signal_type: signalTypeFromSource(envelope.source),
      speaker_scope: envelope.speaker_scope ?? "unknown",
      timeframe: envelope.timeframe ?? "unknown",
      evidence_span_count: envelope.evidence_spans?.length ?? 0,
      ...ctx
    });
  }

  const quickModeAccepted = (!existing.quick_mode && nextState.quick_mode) || payload.data.action === "switch_quick_mode";
  if (quickModeAccepted) {
    logStructured("info", "lucy_quick_mode_accepted", {
      user_id: user.id,
      ...ctx
    });
  }

  if (lastAssistant?.kind === "redirect" && /switch to quick questions/i.test(lastAssistant.content)) {
    logStructured("info", "lucy_quick_mode_offered", {
      user_id: user.id,
      ...ctx
    });
  }

  const confirmationAsked =
    lastAssistant?.kind === "clarification" &&
    (lastAssistant.options?.some((option) => option.value === "yes") ?? false) &&
    (lastAssistant.options?.some((option) => option.value === "no") ?? false);
  if (confirmationAsked) {
    logStructured("info", "lucy_confirmation_asked", {
      user_id: user.id,
      reason: "medium_confidence_or_ambiguity",
      ...ctx
    });
  }

  if (lastAssistant?.kind === "summary") {
    logStructured("info", "lucy_synthesis_shown", {
      user_id: user.id,
      ...ctx
    });
  }

  if (lastAssistant?.kind === "clarification" && /still need one or two answers|fill the missing pieces/i.test(lastAssistant.content)) {
    const requiredFieldCount = [
      "past_attribution",
      "conflict_speed",
      "support_need",
      "emotional_openness",
      "love_expression",
      "relationship_vision",
      "relational_strengths",
      "growth_intention"
    ].filter((field) => {
      const value = nextState.extracted_data[field as LucyAnswerField];
      if (Array.isArray(value)) return value.length > 0;
      return value !== undefined && value !== null;
    }).length;
    logStructured("info", "lucy_gap_fill_started", {
      user_id: user.id,
      missing_fields_count: 8 - requiredFieldCount,
      ...ctx
    });
  }

  if (!existing.control_flags.safety_flag && nextState.control_flags.safety_flag) {
    let safetyType = "unknown";
    if (lastAssistant?.kind === "safety") {
      if (/crisis|hurt myself|suicide/i.test(lastAssistant.content)) safetyType = "self_harm";
      else if (/harming anyone|danger/i.test(lastAssistant.content)) safetyType = "threat";
      else if (/hateful language/i.test(lastAssistant.content)) safetyType = "hate";
    }
    logStructured("warn", "lucy_safety_triggered", {
      user_id: user.id,
      type: safetyType,
      ...ctx
    });
  }

  if ((nextState.control_flags.repeat_prompt_guard_hits ?? 0) > (existing.control_flags.repeat_prompt_guard_hits ?? 0)) {
    logStructured("info", "lucy_repeat_prompt_guard_triggered", {
      user_id: user.id,
      hits: nextState.control_flags.repeat_prompt_guard_hits ?? 0,
      ...ctx
    });
  }

  return NextResponse.json({ session: buildLucySessionView(nextState) }, { status: 200 });
}
