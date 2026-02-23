"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { trackUxEvent, type UxPayload } from "@/lib/observability/uxClient";
import type { LucyAnswers, LucyOption, LucySessionView } from "@/lib/onboarding/lucy/types";

type LucySessionResponse = {
  session: LucySessionView;
};

function sanitizeBubbleContent(content: string): string {
  return content.replace(/[ \t]+\n/g, "\n").replace(/\s+$/u, "");
}

function isSubmissionReady(answers: Partial<LucyAnswers>): answers is LucyAnswers {
  return Boolean(
    answers.past_attribution &&
      answers.conflict_speed &&
      answers.support_need &&
      answers.emotional_openness &&
      answers.love_expression &&
      answers.love_expression.length >= 1 &&
      answers.relationship_vision &&
      answers.relational_strengths &&
      answers.relational_strengths.length >= 1 &&
      answers.growth_intention
  );
}

export function OnboardingFlow({ userId }: { userId: string }) {
  const router = useRouter();
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<LucySessionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const isFreeMode = session?.freeMode?.enabled ?? false;

  function telemetryContext(view: LucySessionView | null): UxPayload {
    const telemetry = view?.telemetry;
    return {
      variant: telemetry?.variant ?? view?.controlFlags.experiment_variant ?? "unknown",
      turn_number: telemetry?.turn_number ?? view?.messages.filter((message) => message.role === "user").length ?? 0,
      stage_or_thread: telemetry?.stage_or_thread ?? view?.currentStage ?? "unknown",
      session_id: telemetry?.session_id ?? "unknown",
      model_version: telemetry?.model_version ?? view?.controlFlags.model_version ?? "unknown",
      prompt_version: telemetry?.prompt_version ?? view?.controlFlags.prompt_version ?? "unknown",
      understanding_source: telemetry?.understanding_source ?? view?.controlFlags.last_understanding_source ?? "rule",
      fallback_reason: telemetry?.fallback_reason ?? view?.controlFlags.fallback_reason ?? "none",
      provider_used: telemetry?.provider_used ?? view?.controlFlags.provider_used_last_turn ?? "none",
      llm_latency_ms: telemetry?.llm_latency_ms ?? view?.controlFlags.last_llm_latency_ms ?? null,
      schema_validation_failed: telemetry?.schema_validation_failed ?? view?.controlFlags.schema_validation_failed ?? false,
      user_confusion_turn: telemetry?.user_confusion_turn ?? view?.controlFlags.user_confusion_turn ?? false,
      challenge_detected: telemetry?.challenge_detected ?? view?.controlFlags.challenge_detected_turn ?? false,
      dispute_resolved: telemetry?.dispute_resolved ?? view?.controlFlags.dispute_resolved_turn ?? false,
      stage_jump_after_dispute:
        telemetry?.stage_jump_after_dispute ?? view?.controlFlags.stage_jump_after_dispute_turn ?? false,
      explanation_requested:
        telemetry?.explanation_requested ?? view?.controlFlags.explanation_requested_turn ?? false,
      topic_switch_detected:
        telemetry?.topic_switch_detected ?? view?.controlFlags.topic_switch_detected_turn ?? false,
      pending_confirmation_attempts: view?.controlFlags.pending_confirmation_attempts ?? 0,
      confirmation_loop_count: view?.controlFlags.confirmation_loop_count ?? 0,
      lead_field_jump_count: view?.controlFlags.lead_field_jump_count ?? 0,
      stale_pending_reset_count: view?.controlFlags.stale_pending_reset_count ?? 0,
      repeat_prompt_guard_triggered:
        telemetry?.repeat_prompt_guard_triggered ??
        ((view?.controlFlags.repeat_prompt_guard_hits ?? 0) > 0)
    };
  }

  const stageTitle = useMemo(() => {
    if (!session) return "Lucy";
    if (session.progress.stage_number === 0) return "Lucy • Getting started";
    if (session.currentStage === "closing") return "Lucy • Summary";
    return `Lucy • Stage ${session.progress.stage_number}/${session.progress.total_stages}`;
  }, [session]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [session?.messages.length, sending]);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/lucy/session", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load Lucy onboarding session.");
      }
      const payload = (await response.json()) as LucySessionResponse;
      setSession(payload.session);
      trackUxEvent("lucy_onboarding_viewed", {
        userIdPresent: Boolean(userId),
        ...telemetryContext(payload.session)
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load Lucy onboarding session.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function sendMessage(message: string, action: "send" | "switch_quick_mode" = "send") {
    setSending(true);
    setError(null);
    const previousSession = session;
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const response = await fetch("/api/onboarding/lucy/message", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action,
          message,
          clientMessageId: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now())
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not send message.");
      }

      const payload = (await response.json()) as LucySessionResponse;
      setSession(payload.session);
      setInput("");
      const base = telemetryContext(payload.session);
      const lastAssistantMessage = [...payload.session.messages].reverse().find((entry) => entry.role === "assistant");
      const latencyMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);

      trackUxEvent("lucy_message_sent", {
        stage: payload.session.currentStage,
        ...base
      });

      trackUxEvent("lucy_response_generated", {
        intent: lastAssistantMessage?.kind ?? "normal",
        latency_ms: latencyMs,
        repeat_prompt_guard_triggered:
          (payload.session.controlFlags.repeat_prompt_guard_hits ?? 0) >
          (previousSession?.controlFlags.repeat_prompt_guard_hits ?? 0),
        ...base
      });

      const previousEnvelopes = previousSession?.extractionEnvelopes ?? {};
      const nextEnvelopes = payload.session.extractionEnvelopes ?? {};
      for (const [field, envelope] of Object.entries(nextEnvelopes)) {
        if (!envelope) continue;
        const before = previousEnvelopes[field as keyof typeof previousEnvelopes];
        if (JSON.stringify(before) === JSON.stringify(envelope)) continue;
        const confidence = envelope.confidence;
        trackUxEvent("lucy_signal_extracted", {
          field,
          confidence_bucket: confidence >= 80 ? "high" : confidence >= 60 ? "medium" : "low",
          signal_type: envelope.source === "quick_mode" ? "direct_self_statement" : envelope.source === "inferred" ? "meta_signal" : "story_inference",
          speaker_scope: envelope.speaker_scope ?? "unknown",
          timeframe: envelope.timeframe ?? "unknown",
          evidence_span_count: envelope.evidence_spans?.length ?? 0,
          ...base
        });
      }

      const quickModeAccepted = action === "switch_quick_mode" || (!previousSession?.quickMode && payload.session.quickMode);
      if (quickModeAccepted) {
        trackUxEvent("lucy_quick_mode_accepted", base);
      }

      if (lastAssistantMessage?.kind === "redirect" && /switch to quick questions/i.test(lastAssistantMessage.content)) {
        trackUxEvent("lucy_quick_mode_offered", base);
      }

      const confirmationAsked =
        lastAssistantMessage?.kind === "clarification" &&
        (lastAssistantMessage.options?.some((option) => option.value === "yes") ?? false) &&
        (lastAssistantMessage.options?.some((option) => option.value === "no") ?? false);
      if (confirmationAsked) {
        trackUxEvent("lucy_confirmation_asked", {
          reason: "medium_confidence_or_ambiguity",
          ...base
        });
      }

      if (lastAssistantMessage?.kind === "summary") {
        trackUxEvent("lucy_synthesis_shown", base);
      }

      if (
        lastAssistantMessage?.kind === "clarification" &&
        /still need one or two answers|fill the missing pieces/i.test(lastAssistantMessage.content)
      ) {
        const filledCount = Object.values(payload.session.requiredAnswers).filter((value) => {
          if (Array.isArray(value)) return value.length > 0;
          return value !== undefined && value !== null;
        }).length;
        trackUxEvent("lucy_gap_fill_started", {
          missing_fields_count: Math.max(0, 8 - filledCount),
          ...base
        });
      }

      if (!previousSession?.controlFlags.safety_flag && payload.session.controlFlags.safety_flag) {
        trackUxEvent("lucy_safety_triggered", {
          type: "flagged",
          ...base
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  async function sendFreeAction(action: "send" | "finish", message = "") {
    setSending(true);
    setError(null);
    const previousSession = session;
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      const response = await fetch("/api/onboarding/lucy/message", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          action,
          message,
          clientMessageId: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : String(Date.now())
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not send message.");
      }

      const payload = (await response.json()) as LucySessionResponse;
      setSession(payload.session);
      setInput("");

      const latencyMs = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt);
      trackUxEvent("lucy_free_turn_processed", {
        action,
        latency_ms: latencyMs,
        extraction_phase: payload.session.freeMode?.extractionPhase ?? "chat",
        turn_number: payload.session.freeMode?.userTurnCount ?? 0,
        gemini_status: payload.session.controlFlags.free_gemini_status ?? "none"
      });

      if (action === "finish") {
        trackUxEvent("lucy_final_extraction_run", {
          missing_fields_count: payload.session.freeMode?.missingFields.length ?? 0
        });
      }

      if (
        previousSession?.freeMode?.extractionPhase !== "followup" &&
        payload.session.freeMode?.extractionPhase === "followup"
      ) {
        trackUxEvent("lucy_final_extraction_followup_requested", {
          missing_fields_count: payload.session.freeMode?.missingFields.length ?? 0
        });
      }

      if (
        previousSession?.freeMode?.extractionPhase !== "manual_gap_fill" &&
        payload.session.freeMode?.extractionPhase === "manual_gap_fill"
      ) {
        trackUxEvent("lucy_manual_gap_fill_started", {
          field: payload.session.freeMode?.manualGapField ?? "unknown"
        });
      }

      if (!previousSession?.canSubmit && payload.session.canSubmit) {
        trackUxEvent("lucy_free_onboarding_ready_to_complete", {});
      }

    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send message.");
    } finally {
      setSending(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!input.trim() || sending) return;
    if (isFreeMode) {
      await sendFreeAction("send", input.trim());
      return;
    }
    await sendMessage(input.trim(), "send");
  }

  async function completeOnboarding() {
    if (!session || !session.canSubmit || !isSubmissionReady(session.requiredAnswers) || completing) return;

    setCompleting(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          past_attribution: session.requiredAnswers.past_attribution,
          conflict_speed: session.requiredAnswers.conflict_speed,
          support_need: session.requiredAnswers.support_need,
          emotional_openness: session.requiredAnswers.emotional_openness,
          love_expression: session.requiredAnswers.love_expression,
          relationship_vision: session.requiredAnswers.relationship_vision,
          relational_strengths: session.requiredAnswers.relational_strengths,
          growth_intention: session.requiredAnswers.growth_intention
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not complete onboarding.");
      }

      trackUxEvent("onboarding_completed", {
        flow: "lucy",
        usedQuickMode: session.quickMode,
        ...telemetryContext(session)
      });
      router.push("/profile/setup");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete onboarding.");
    } finally {
      setCompleting(false);
    }
  }

  if (loading) {
    return (
      <main className="public-main onboarding-main">
        <section className="panel">
          <p className="muted">Loading Lucy onboarding...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="public-main onboarding-main">
      <section className="lucy-shell panel">
        {isFreeMode ? (
          <header className="lucy-header">
            <div className="lucy-header-row">
              <p className="eyebrow">Lucy</p>
            </div>
            <p className="tiny muted">Talk naturally. When you’re ready, tap “I’m done”.</p>
          </header>
        ) : (
          <header className="lucy-header">
            <div className="lucy-header-row">
              <p className="eyebrow">{stageTitle}</p>
              {session ? <p className="tiny muted">{session.progress.stage_label}</p> : null}
            </div>
            <div
              className="onboarding-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={session?.progress.percent ?? 0}
            >
              <span className="onboarding-progress-fill" style={{ width: `${session?.progress.percent ?? 0}%` }} />
            </div>
            <p className="tiny muted">About 8 to 12 minutes total.</p>
          </header>
        )}

        <div className="lucy-thread" ref={threadRef}>
          {session?.messages.map((msg) => (
            <article
              key={msg.id}
              className={`lucy-bubble ${msg.role === "assistant" ? "assistant" : msg.role === "user" ? "user" : "system"}`}
            >
              <p>{sanitizeBubbleContent(msg.content)}</p>
            </article>
          ))}
          {sending ? (
            <article className="lucy-bubble assistant typing">
              <p>Lucy is thinking...</p>
            </article>
          ) : null}
        </div>

        {session?.promptOptions && session.promptOptions.length > 0 && !session.completed ? (
          <div className="lucy-options" aria-label="Quick options">
            {session.promptOptions.map((option: LucyOption) => (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                className="lucy-option-chip"
                onClick={() => (isFreeMode ? void sendFreeAction("send", option.value) : void sendMessage(option.value))}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="onboarding-error">{error}</p> : null}

        {session?.completed && session.canSubmit ? (
          <div className="lucy-complete-wrap">
            <button type="button" onClick={() => void completeOnboarding()} disabled={completing}>
              {completing ? "Finalizing..." : "Continue to profile setup"}
            </button>
          </div>
        ) : (
          <footer className="lucy-composer-wrap">
            {isFreeMode && session?.freeMode?.extractionPhase === "chat" ? (
              <button
                type="button"
                className="ghost"
                disabled={sending || !(session?.freeMode?.doneEligible ?? false)}
                onClick={() => void sendFreeAction("finish")}
              >
                {session?.freeMode?.doneEligible
                  ? "I’m done"
                  : `I’m done (${session?.freeMode?.userTurnCount ?? 0}/${session?.freeMode?.doneMinTurns ?? 8})`}
              </button>
            ) : null}
            {!isFreeMode ? (
              <button
                type="button"
                className="ghost"
                disabled={sending}
                onClick={() => void sendMessage("", "switch_quick_mode")}
              >
                Quick questions
              </button>
            ) : null}
            <form className="lucy-composer" onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Type your response..."
                disabled={sending}
                maxLength={1000}
              />
              <button type="submit" disabled={sending || !input.trim()}>
                Send
              </button>
            </form>
          </footer>
        )}
      </section>
    </main>
  );
}
