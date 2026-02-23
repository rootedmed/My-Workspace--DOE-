import {
  FLEX_BLOCK_A,
  FLEX_BLOCK_B,
  LUCY_STAGE_ORDER,
  OPENING_MESSAGES,
  QUICK_OPTIONS,
  REQUIRED_STAGE_FIELDS,
  STAGE_LABELS,
  STAGE_PROMPTS,
  STAGE_TRANSITIONS
} from "@/lib/onboarding/lucy/config";
import {
  buildRedirectPolicy,
  detectOffTopicCategory,
  detectSafetyType,
  detectVagueResponse,
  getRedirectResponse,
  isAffirmative,
  isEditIntent,
  parseStageSelection
} from "@/lib/onboarding/lucy/detectors";
import {
  extractForStage,
  hasAllRequiredAnswers,
  inferCrossStagePrefills,
  isLikelyOnTopic,
  parseConsent,
  parseQuickModeAnswer
} from "@/lib/onboarding/lucy/extractors";
import { assignLucyVariant, resolveLucyModelVersion, resolveLucyPromptVersion } from "@/lib/onboarding/lucy/experiments";
import type {
  ConversationControlFlags,
  LucyAnswerField,
  LucyAnswers,
  LucyMessage,
  LucyOption,
  LucySessionState,
  LucySessionView,
  LucyStageId,
  StageState
} from "@/lib/onboarding/lucy/types";

const REQUIRED_STAGES: LucyStageId[] = [
  "past_attribution",
  "conflict_speed",
  "support_need",
  "emotional_openness",
  "love_expression",
  "relationship_vision",
  "relational_strengths",
  "growth_intention"
];

function nowIso(): string {
  return new Date().toISOString();
}

function messageId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function buildStageStates(now: string): Record<LucyStageId, StageState> {
  return LUCY_STAGE_ORDER.reduce(
    (acc, stage) => ({
      ...acc,
      [stage]: {
        stage_id: stage,
        status: stage === "opening" ? "active" : "pending",
        confidence: 0,
        clarification_count: 0,
        off_topic_count: 0,
        started_at: stage === "opening" ? now : null,
        completed_at: null,
        prefilled: false,
        requires_confirmation: false
      }
    }),
    {} as Record<LucyStageId, StageState>
  );
}

function buildDefaultFlags(userId: string): ConversationControlFlags {
  const variant = assignLucyVariant(userId);
  return {
    used_quick_mode: false,
    needs_manual_review: false,
    safety_flag: false,
    contradiction_flag: false,
    api_retry_count: 0,
    experiment_variant: variant,
    model_version: resolveLucyModelVersion(variant),
    prompt_version: resolveLucyPromptVersion(variant),
    understanding_mode: variant === "treatment_b" ? "llm_first_v1" : "rules_fallback",
    fallback_reason: "none",
    repeat_prompt_guard_hits: 0,
    confirmation_loop_count: 0,
    lead_field_jump_count: 0,
    stale_pending_reset_count: 0,
    pending_confirmation_attempts: 0,
    pending_confirmation_explained: false,
    provider_used_last_turn: "none",
    user_confusion_turn: false,
    disputed_fields: [],
    field_timeframe_tags: {},
    challenge_detected_turn: false,
    dispute_resolved_turn: false,
    stage_jump_after_dispute_turn: false,
    explanation_requested_turn: false,
    topic_switch_detected_turn: false,
    unresolved_attempts: {},
    schema_validation_failed: false,
    awaiting_edit_stage: false
  };
}

function addMessage(
  state: LucySessionState,
  payload: Omit<LucyMessage, "id" | "created_at">
): LucySessionState {
  const created_at = nowIso();
  const message: LucyMessage = {
    id: messageId(),
    created_at,
    ...payload
  };
  return {
    ...state,
    messages: [...state.messages, message],
    updated_at: created_at
  };
}

function addAssistantMessage(
  state: LucySessionState,
  content: string,
  kind: LucyMessage["kind"] = "normal",
  options: LucyOption[] = []
): LucySessionState {
  return addMessage(state, {
    role: "assistant",
    content,
    stage_id: state.current_stage,
    kind,
    options: options.length > 0 ? options : undefined
  });
}

function getStagePrompt(stage: LucyStageId, clarificationCount = 0): string {
  const prompts = STAGE_PROMPTS[stage];
  if (!prompts || prompts.length === 0) return "";
  return prompts[Math.min(clarificationCount, prompts.length - 1)] ?? prompts[0]!;
}

function activateStage(state: LucySessionState, stage: LucyStageId): LucySessionState {
  const timestamp = nowIso();
  return {
    ...state,
    current_stage: stage,
    stage_states: {
      ...state.stage_states,
      [stage]: {
        ...state.stage_states[stage],
        status: state.stage_states[stage].status === "complete" ? "complete" : "active",
        started_at: state.stage_states[stage].started_at ?? timestamp
      }
    },
    updated_at: timestamp
  };
}

function markCurrentStageComplete(state: LucySessionState, confidence: number): LucySessionState {
  const stage = state.current_stage;
  const timestamp = nowIso();
  return {
    ...state,
    stage_states: {
      ...state.stage_states,
      [stage]: {
        ...state.stage_states[stage],
        status: "complete",
        confidence: Math.max(state.stage_states[stage].confidence, confidence),
        completed_at: timestamp,
        requires_confirmation: false
      }
    },
    updated_at: timestamp
  };
}

function markStageFallback(state: LucySessionState): LucySessionState {
  const stage = state.current_stage;
  return {
    ...state,
    stage_states: {
      ...state.stage_states,
      [stage]: {
        ...state.stage_states[stage],
        status: "fallback"
      }
    },
    updated_at: nowIso()
  };
}

function stageByNumber(index: number): LucyStageId | null {
  const map: Record<number, LucyStageId> = {
    1: "past_attribution",
    2: "conflict_speed",
    3: "support_need",
    4: "emotional_openness",
    5: "love_expression",
    6: "relationship_vision",
    7: "relational_strengths",
    8: "growth_intention"
  };
  return map[index] ?? null;
}

function choosePreferredInFlexibleBlockA(state: LucySessionState, latestUserMessage: string): LucyStageId {
  const text = latestUserMessage.toLowerCase();
  const unresolved = FLEX_BLOCK_A.filter((stage) => state.stage_states[stage].status !== "complete");
  if (unresolved.length === 0) return "support_need";

  if (unresolved.includes("love_expression") && /love|affection|touch|time|words|gift|care/.test(text)) {
    return "love_expression";
  }
  if (unresolved.includes("emotional_openness") && /vulnerable|open|private|guarded|share/.test(text)) {
    return "emotional_openness";
  }
  if (unresolved.includes("support_need") && /stress|support|help|space|listen/.test(text)) {
    return "support_need";
  }
  return unresolved[0]!;
}

function choosePreferredInFlexibleBlockB(state: LucySessionState, latestUserMessage: string): LucyStageId {
  const text = latestUserMessage.toLowerCase();
  const unresolved = FLEX_BLOCK_B.filter((stage) => state.stage_states[stage].status !== "complete");
  if (unresolved.length === 0) return "relationship_vision";

  if (unresolved.includes("relational_strengths") && /proud|strength|bring|show up|loyal|honest/.test(text)) {
    return "relational_strengths";
  }
  if (unresolved.includes("relationship_vision") && /healthy|ideal|relationship|future|together/.test(text)) {
    return "relationship_vision";
  }
  return unresolved[0]!;
}

function determineNextStage(state: LucySessionState, latestUserMessage: string): LucyStageId {
  if (state.stage_states.past_attribution.status !== "complete") return "past_attribution";
  if (state.stage_states.conflict_speed.status !== "complete") return "conflict_speed";

  const unresolvedBlockA = FLEX_BLOCK_A.filter((stage) => state.stage_states[stage].status !== "complete");
  if (unresolvedBlockA.length > 0) {
    return choosePreferredInFlexibleBlockA(state, latestUserMessage);
  }

  const unresolvedBlockB = FLEX_BLOCK_B.filter((stage) => state.stage_states[stage].status !== "complete");
  if (unresolvedBlockB.length > 0) {
    return choosePreferredInFlexibleBlockB(state, latestUserMessage);
  }

  if (state.stage_states.growth_intention.status !== "complete") return "growth_intention";
  return "closing";
}

function getClarificationPrompt(stage: LucyStageId, kind: "first" | "second"): string {
  if (kind === "first") {
    switch (stage) {
      case "past_attribution":
        return "Was it more daily communication friction or bigger life-direction mismatch?";
      case "conflict_speed":
        return "If forced to pick, are you closer to talk-now or space-first?";
      case "support_need":
        return "Which one matters most in the first hour when stress hits?";
      case "emotional_openness":
        return "In your last relationship, did you open up mostly quickly or mostly selectively?";
      case "love_expression":
        return "Which one or two are most consistent from you?";
      case "relationship_vision":
        return "Which one is non-negotiable for long-term fit?";
      case "relational_strengths":
        return "Pick the top one or two that best fit you.";
      case "growth_intention":
        return "If you had to prioritize one shift first, which is it?";
      default:
        return "Could you say a little more?";
    }
  }

  switch (stage) {
    case "past_attribution":
      return "If you had to name one root issue, which was biggest?";
    case "conflict_speed":
      return "Pick a number from 1 to 5 where 1 is talk now and 5 is space first.";
    case "support_need":
      return "Pick your default, even if it is not perfect.";
    case "emotional_openness":
      return "Should I mark you closer to open (1-2) or selective (4-5)?";
    case "love_expression":
      return "Quick pick: choose your top one or two love-expression styles.";
    case "relationship_vision":
      return "Quick pick the vision that fits best.";
    case "relational_strengths":
      return "Quick pick your top one or two strengths.";
    case "growth_intention":
      return "Quick pick the one growth focus that matters most right now.";
    default:
      return "Could you choose the option closest to you?";
  }
}

function detectContradiction(data: Partial<LucyAnswers>): string | null {
  if (data.conflict_speed && data.support_need) {
    if (data.conflict_speed <= 2 && data.support_need === "space") {
      return "Earlier you mentioned needing space when stressed, and also resolving conflict quickly. Are both true in different situations?";
    }
  }
  if (data.emotional_openness && data.growth_intention) {
    if (data.emotional_openness >= 4 && data.growth_intention === "depth") {
      return "You chose deeper honesty and also a private emotional style. Should I treat that as a growth goal rather than your current pattern?";
    }
  }
  return null;
}

function buildSummary(data: Partial<LucyAnswers>): string {
  const lines: string[] = [
    "Here’s what I captured:",
    `- Past pattern: ${data.past_attribution ?? "pending"}`,
    `- Conflict pace: ${data.conflict_speed ?? "pending"}`,
    `- Stress support: ${data.support_need ?? "pending"}`,
    `- Emotional openness: ${data.emotional_openness ?? "pending"}`,
    `- Love expression: ${(data.love_expression ?? []).join(", ") || "pending"}`,
    `- Relationship vision: ${data.relationship_vision ?? "pending"}`,
    `- Strengths: ${(data.relational_strengths ?? []).join(", ") || "pending"}`,
    `- Growth focus: ${data.growth_intention ?? "pending"}`
  ];
  lines.push("Anything you want to change before I lock this?");
  return lines.join("\n");
}

function getPromptOptions(state: LucySessionState): LucyOption[] {
  if (state.current_stage === "closing") {
    if (state.control_flags.awaiting_edit_stage) {
      return [
        { value: "1", label: "1 · Past pattern" },
        { value: "2", label: "2 · Conflict pace" },
        { value: "3", label: "3 · Support need" },
        { value: "4", label: "4 · Emotional openness" },
        { value: "5", label: "5 · Love expression" },
        { value: "6", label: "6 · Relationship vision" },
        { value: "7", label: "7 · Strengths" },
        { value: "8", label: "8 · Growth intention" }
      ];
    }
    return [
      { value: "confirm", label: "Looks good" },
      { value: "edit", label: "Change an answer" }
    ];
  }

  const currentStageState = state.stage_states[state.current_stage];
  if (currentStageState.requires_confirmation) {
    return [
      { value: "yes", label: "Yes, keep it" },
      { value: "no", label: "No, change it" }
    ];
  }

  const field = REQUIRED_STAGE_FIELDS[state.current_stage];
  if (!field) return [];
  if (state.quick_mode || currentStageState.status === "fallback") {
    return QUICK_OPTIONS[field] ?? [];
  }
  return [];
}

export function createInitialLucySession(userId: string): LucySessionState {
  const now = nowIso();
  const session: LucySessionState = {
    user_id: userId,
    session_id: messageId(),
    current_stage: "opening",
    stage_states: buildStageStates(now),
    messages: [],
    extracted_data: {},
    extraction_envelopes: {},
    control_flags: buildDefaultFlags(userId),
    off_topic_total: 0,
    off_topic_consecutive: 0,
    quick_mode: false,
    completed: false,
    last_prompt_id: "opening",
    last_user_message_id: null,
    started_at: now,
    updated_at: now
  };

  return addAssistantMessage(session, OPENING_MESSAGES[0]!, "normal");
}

function withCurrentStagePrompt(
  state: LucySessionState,
  prefix?: string,
  kind: LucyMessage["kind"] = "normal"
): LucySessionState {
  const stageState = state.stage_states[state.current_stage];
  const prompt = getStagePrompt(state.current_stage, stageState.clarification_count);
  const content = prefix ? `${prefix}\n${prompt}` : prompt;
  return addAssistantMessage(state, content, kind, getPromptOptions(state));
}

function markPrefills(state: LucySessionState, rawInput: string): LucySessionState {
  const prefills = inferCrossStagePrefills(rawInput, state);
  if (prefills.length === 0) return state;

  let next = state;
  for (const prefill of prefills) {
    const stage = (Object.entries(REQUIRED_STAGE_FIELDS).find(([, field]) => field === prefill.field)?.[0] ??
      null) as LucyStageId | null;
    if (!stage) continue;

    next = {
      ...next,
      extracted_data: {
        ...next.extracted_data,
        [prefill.field]: prefill.value
      },
      extraction_envelopes: {
        ...next.extraction_envelopes,
        [prefill.field]: {
          field: prefill.field,
          value: prefill.value as never,
          confidence: prefill.confidence,
          source: "inferred",
          requires_confirmation: true
        }
      },
      stage_states: {
        ...next.stage_states,
        [stage]: {
          ...next.stage_states[stage],
          prefilled: true,
          requires_confirmation: true
        }
      }
    };
  }
  return next;
}

function confirmPrefilledStage(state: LucySessionState, confirm: boolean): LucySessionState {
  const stage = state.current_stage;
  const field = REQUIRED_STAGE_FIELDS[stage];
  if (!field) return state;
  const stageState = state.stage_states[stage];

  if (!stageState.requires_confirmation) return state;

  if (confirm) {
    let next = markCurrentStageComplete(state, Math.max(80, stageState.confidence));
    next = {
      ...next,
      stage_states: {
        ...next.stage_states,
        [stage]: {
          ...next.stage_states[stage],
          requires_confirmation: false,
          prefilled: false
        }
      }
    };
    return next;
  }

  return {
    ...state,
    stage_states: {
      ...state.stage_states,
      [stage]: {
        ...stageState,
        requires_confirmation: false,
        prefilled: false,
        status: "active"
      }
    },
    extraction_envelopes: {
      ...state.extraction_envelopes,
      [field]: undefined
    },
    extracted_data: {
      ...state.extracted_data,
      [field]: undefined
    }
  };
}

function advanceFromCompletedStage(state: LucySessionState, rawInput: string): LucySessionState {
  const nextStage = determineNextStage(state, rawInput);
  const next = activateStage(state, nextStage);

  if (nextStage === "closing") {
    return addAssistantMessage(next, buildSummary(next.extracted_data), "summary", getPromptOptions(next));
  }

  if (next.stage_states[nextStage].requires_confirmation) {
    const field = REQUIRED_STAGE_FIELDS[nextStage] as LucyAnswerField;
    const value = next.extracted_data[field];
    return addAssistantMessage(
      next,
      `I already inferred ${STAGE_LABELS[nextStage]} as "${Array.isArray(value) ? value.join(", ") : value}". Keep this?`,
      "clarification",
      getPromptOptions(next)
    );
  }

  const bridge = STAGE_TRANSITIONS[state.current_stage];
  return withCurrentStagePrompt(next, bridge ?? undefined);
}

function applyStageExtraction(state: LucySessionState, rawInput: string): LucySessionState {
  const stage = state.current_stage;
  const field = REQUIRED_STAGE_FIELDS[stage];
  if (!field) return state;

  const stageState = state.stage_states[stage];

  if (stageState.requires_confirmation) {
    const confirm = isAffirmative(rawInput);
    const deny = /\bno\b|\bchange\b|\bedit\b/i.test(rawInput);
    if (confirm || deny) {
      const updated = confirmPrefilledStage(state, confirm);
      if (confirm) {
        return advanceFromCompletedStage(updated, rawInput);
      }
      return withCurrentStagePrompt(updated, "No problem. Let’s answer this directly.");
    }
    return addAssistantMessage(updatedCopy(state), "Would you like to keep this inferred answer? Yes or no.", "clarification", getPromptOptions(state));
  }

  const quickModeValue = (state.quick_mode || stageState.status === "fallback") ? parseQuickModeAnswer(field, rawInput) : undefined;
  const extraction = quickModeValue !== undefined ? { matched: true, value: quickModeValue, confidence: 95, ambiguous: false } : extractForStage(stage, rawInput);

  const vague = detectVagueResponse(rawInput);
  const confidence = extraction.matched ? extraction.confidence : 0;

  if (!extraction.matched || confidence < 75 || extraction.ambiguous) {
    const clarificationCount = stageState.clarification_count + 1;
    let next = {
      ...state,
      stage_states: {
        ...state.stage_states,
        [stage]: {
          ...stageState,
          clarification_count: clarificationCount,
          status: clarificationCount >= 3 ? "fallback" : stageState.status
        }
      }
    };

    if (clarificationCount >= 3) {
      next = markStageFallback(next);
      next = {
        ...next,
        control_flags: {
          ...next.control_flags,
          needs_manual_review: true
        }
      };
      return addAssistantMessage(
        next,
        "I want to make this easy. Let’s do a quick pick for this one.",
        "clarification",
        getPromptOptions(next)
      );
    }

    const prompt = getClarificationPrompt(stage, clarificationCount === 1 ? "first" : "second");
    const intro =
      vague === "idk"
        ? "No pressure."
        : vague === "complicated"
          ? "Totally fair."
          : vague === "all_of_above"
            ? "Makes sense."
            : vague === "depends"
              ? "That’s common."
              : "I want to make sure I capture this accurately.";
    return addAssistantMessage(next, `${intro} ${prompt}`, "clarification", getPromptOptions(next));
  }

  let next = {
    ...state,
    extracted_data: {
      ...state.extracted_data,
      [field]: extraction.value as never
    },
    extraction_envelopes: {
      ...state.extraction_envelopes,
      [field]: {
        field,
        value: extraction.value as never,
        confidence: extraction.confidence,
        source: state.quick_mode || stageState.status === "fallback" ? "quick_mode" : "chat",
        requires_confirmation: false
      }
    }
  };

  next = markCurrentStageComplete(next, extraction.confidence);
  next = markPrefills(next, rawInput);

  const contradictionPrompt = detectContradiction(next.extracted_data);
  if (contradictionPrompt && !next.control_flags.pending_contradiction_prompt) {
    next = {
      ...next,
      control_flags: {
        ...next.control_flags,
        contradiction_flag: true,
        pending_contradiction_prompt: contradictionPrompt
      }
    };
    return addAssistantMessage(next, contradictionPrompt, "clarification");
  }

  return advanceFromCompletedStage(next, rawInput);
}

function updatedCopy(state: LucySessionState): LucySessionState {
  return {
    ...state,
    updated_at: nowIso()
  };
}

function handleClosingStage(state: LucySessionState, rawInput: string): LucySessionState {
  if (state.control_flags.awaiting_edit_stage) {
    const selection = parseStageSelection(rawInput);
    const stage = selection ? stageByNumber(selection) : null;
    if (!stage) {
      return addAssistantMessage(state, "Tell me which stage to change (1-8).", "clarification", getPromptOptions(state));
    }

    const next = activateStage(
      {
        ...state,
        control_flags: {
          ...state.control_flags,
          awaiting_edit_stage: false
        },
        completed: false
      },
      stage
    );
    return withCurrentStagePrompt(next, `No problem. Let’s update ${STAGE_LABELS[stage]}.`);
  }

  if (isEditIntent(rawInput)) {
    return addAssistantMessage(
      {
        ...state,
        control_flags: {
          ...state.control_flags,
          awaiting_edit_stage: true
        }
      },
      "Sure. Which stage do you want to change? Reply with 1-8.",
      "clarification",
      getPromptOptions({
        ...state,
        control_flags: {
          ...state.control_flags,
          awaiting_edit_stage: true
        }
      })
    );
  }

  if (isAffirmative(rawInput)) {
    if (!hasAllRequiredAnswers(state.extracted_data)) {
      return addAssistantMessage(
        {
          ...state,
          control_flags: { ...state.control_flags, needs_manual_review: true }
        },
        "I still need one or two answers before finalizing. Let’s fill the missing pieces.",
        "clarification"
      );
    }
    return addAssistantMessage(
      {
        ...state,
        completed: true
      },
      "Done. I’m now finding your best-fit matches and moving you to profile setup.",
      "summary"
    );
  }

  return addAssistantMessage(state, "If everything looks right, reply “yes”. If not, say “change”.", "clarification", getPromptOptions(state));
}

export function processLucyUserMessage(
  state: LucySessionState,
  rawInput: string,
  userMessageId?: string
): LucySessionState {
  const messageText = rawInput.trim();
  if (!messageText) {
    return addAssistantMessage(state, "Send a quick response and I’ll keep going.");
  }

  if (userMessageId && state.last_user_message_id === userMessageId) {
    return state;
  }

  let next = addMessage(state, {
    role: "user",
    content: messageText,
    stage_id: state.current_stage
  });
  next = {
    ...next,
    last_user_message_id: userMessageId ?? null
  };

  if (next.control_flags.pending_contradiction_prompt) {
    const cleared = {
      ...next,
      control_flags: {
        ...next.control_flags,
        pending_contradiction_prompt: undefined
      }
    };
    return advanceFromCompletedStage(cleared, messageText);
  }

  if (next.current_stage === "opening") {
    const consent = parseConsent(messageText);
    if (consent === false) {
      const afterQuickToggle = {
        ...next,
        quick_mode: true,
        control_flags: {
          ...next.control_flags,
          used_quick_mode: true
        }
      };
      const activated = activateStage(afterQuickToggle, "past_attribution");
      return withCurrentStagePrompt(activated, "No problem. We’ll use quick picks.");
    }
    if (consent === true) {
      const stageComplete = markCurrentStageComplete(next, 100);
      const activated = activateStage(stageComplete, "past_attribution");
      return withCurrentStagePrompt(activated, STAGE_TRANSITIONS.opening ?? undefined);
    }

    if (/trust|safe|private|privacy|data|real|bot|human/i.test(messageText)) {
      return addAssistantMessage(
        next,
        "Fair question. I use your answers to build match signals, not public profile text. You can edit anything before I finish. Ready to start?"
      );
    }

    if (/browse|browsing|just looking|not sure|maybe later/i.test(messageText)) {
      return addAssistantMessage(next, "Totally fine if you’re browsing. We can do a lightweight version now and refine later. Want to begin?");
    }

    return addAssistantMessage(next, "If you’re ready, say “yes”. If you want speed, say “quick mode”.");
  }

  if (next.current_stage === "closing") {
    return handleClosingStage(next, messageText);
  }

  const safety = detectSafetyType(messageText);
  if (safety) {
    const safetyText =
      safety === "self_harm"
        ? "I’m really glad you said that. I can’t support crises directly here, but please contact local emergency services or a crisis line right now."
        : safety === "threat"
          ? "I can’t help with harming anyone. If you’re in immediate danger, contact local emergency services."
          : "I can’t continue with hateful language. If you want to continue onboarding, I can keep this focused and respectful.";

    return addAssistantMessage(
      {
        ...next,
        control_flags: {
          ...next.control_flags,
          safety_flag: true,
          needs_manual_review: true
        }
      },
      safetyText,
      "safety"
    );
  }

  const onTopic = isLikelyOnTopic(next.current_stage, messageText);
  const offTopicCategory = detectOffTopicCategory(messageText);
  if (offTopicCategory && !onTopic) {
    const stage = next.current_stage;
    const offTopicConsecutive = next.off_topic_consecutive + 1;
    const offTopicTotal = next.off_topic_total + 1;
    const policy = buildRedirectPolicy(offTopicTotal, offTopicConsecutive, offTopicCategory);

    const updated = {
      ...next,
      off_topic_total: offTopicTotal,
      off_topic_consecutive: offTopicConsecutive,
      stage_states: {
        ...next.stage_states,
        [stage]: {
          ...next.stage_states[stage],
          off_topic_count: next.stage_states[stage].off_topic_count + 1
        }
      },
      quick_mode: policy.response_tier === "escape_hatch" ? true : next.quick_mode,
      control_flags: {
        ...next.control_flags,
        used_quick_mode: policy.response_tier === "escape_hatch" ? true : next.control_flags.used_quick_mode
      }
    };
    return addAssistantMessage(updated, getRedirectResponse(policy), "redirect", getPromptOptions(updated));
  }

  next = {
    ...next,
    off_topic_consecutive: 0
  };

  return applyStageExtraction(next, messageText);
}

export function switchLucyQuickMode(state: LucySessionState): LucySessionState {
  const next = {
    ...state,
    quick_mode: true,
    control_flags: {
      ...state.control_flags,
      used_quick_mode: true
    }
  };
  return addAssistantMessage(
    next,
    "No problem. I’ll keep your answers and switch to short picks for the rest.",
    "normal",
    getPromptOptions(next)
  );
}

export function buildLucySessionView(state: LucySessionState): LucySessionView {
  const completedCount = REQUIRED_STAGES.filter((stage) => state.stage_states[stage].status === "complete").length;
  const requiredIndex = REQUIRED_STAGES.indexOf(state.current_stage);
  const stageNumber = state.current_stage === "opening" ? 0 : state.current_stage === "closing" ? 8 : Math.max(1, requiredIndex + 1);
  const percent = state.current_stage === "closing" ? 100 : Math.min(95, Math.round((completedCount / 8) * 100));

  return {
    currentStage: state.current_stage,
    progress: {
      stage_number: stageNumber,
      total_stages: 8,
      stage_label: STAGE_LABELS[state.current_stage],
      percent
    },
    messages: state.messages,
    stageStates: state.stage_states,
    controlFlags: state.control_flags,
    quickMode: state.quick_mode,
    completed: state.completed,
    requiredAnswers: state.extracted_data,
    extractionEnvelopes: state.extraction_envelopes,
    telemetry: {
      variant: state.control_flags.experiment_variant,
      turn_number: state.messages.filter((message) => message.role === "user").length,
      stage_or_thread: state.control_flags.topic_thread_id ?? state.current_stage,
      session_id: state.session_id,
      model_version: state.control_flags.model_version,
      prompt_version: state.control_flags.prompt_version,
      understanding_source: state.control_flags.last_understanding_source,
      fallback_reason: state.control_flags.fallback_reason,
      repeat_prompt_guard_triggered: (state.control_flags.repeat_prompt_guard_hits ?? 0) > 0,
      llm_latency_ms: state.control_flags.last_llm_latency_ms,
      schema_validation_failed: state.control_flags.schema_validation_failed,
      provider_used: state.control_flags.provider_used_last_turn,
      user_confusion_turn: state.control_flags.user_confusion_turn,
      challenge_detected: state.control_flags.challenge_detected_turn,
      dispute_resolved: state.control_flags.dispute_resolved_turn,
      stage_jump_after_dispute: state.control_flags.stage_jump_after_dispute_turn,
      explanation_requested: state.control_flags.explanation_requested_turn,
      topic_switch_detected: state.control_flags.topic_switch_detected_turn
    },
    promptOptions: getPromptOptions(state),
    canSubmit: state.completed && hasAllRequiredAnswers(state.extracted_data)
  };
}
