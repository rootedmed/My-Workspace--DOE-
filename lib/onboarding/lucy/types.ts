import type {
  ConflictSpeed,
  EmotionalOpenness,
  GrowthIntention,
  LoveExpression,
  PastAttribution,
  RelationshipVision,
  RelationalStrength,
  SupportNeed
} from "@/lib/compatibility";

export type LucyStageId =
  | "opening"
  | "past_attribution"
  | "conflict_speed"
  | "support_need"
  | "emotional_openness"
  | "love_expression"
  | "relationship_vision"
  | "relational_strengths"
  | "growth_intention"
  | "closing";

export type StageStatus = "pending" | "active" | "complete" | "fallback";

export type OffTopicCategory =
  | "testing_lucy"
  | "venting"
  | "flirting"
  | "advice_request"
  | "meta_question"
  | "hostility";

export type ResponseTier = "soft" | "medium" | "firm" | "escape_hatch";

export type LucyExperimentVariant = "control_a" | "treatment_b";
export type LucyLlmProvider = "gemini" | "groq" | "openai" | "openrouter" | "none";
export type ExtractionSpeakerScope = "self" | "partner" | "other";
export type ExtractionTimeframe = "past" | "current" | "desired";
export type LucyFreeExtractionPhase = "chat" | "extracting" | "followup" | "manual_gap_fill" | "ready_to_complete";
export type FreeDialogueAct = "reflect_only" | "reflect_then_bridge" | "clarify_then_bridge" | "direct_bridge";
export type FreeDialoguePhase = "opening" | "middle" | "closing";
export type FreePolicyMode = "strict" | "adaptive";

export interface StageState {
  stage_id: LucyStageId;
  status: StageStatus;
  confidence: number;
  clarification_count: number;
  off_topic_count: number;
  started_at: string | null;
  completed_at: string | null;
  prefilled: boolean;
  requires_confirmation: boolean;
}

export interface ConversationControlFlags {
  used_quick_mode: boolean;
  needs_manual_review: boolean;
  safety_flag: boolean;
  contradiction_flag: boolean;
  api_retry_count: number;
  experiment_variant: LucyExperimentVariant;
  model_version: string;
  prompt_version: string;
  understanding_mode?: "llm_first_v1" | "rules_fallback";
  last_understanding_source?: "llm" | "rule";
  fallback_reason?: "llm_timeout" | "llm_invalid_json" | "llm_empty" | "none";
  repeat_prompt_guard_hits?: number;
  unresolved_attempts?: Partial<Record<LucyAnswerField, number>>;
  last_llm_latency_ms?: number;
  schema_validation_failed?: boolean;
  conversation_mode?: "rapport" | "explore" | "synthesis" | "gap_fill" | "closing";
  synthesis_presented?: boolean;
  pending_confirmation_field?: LucyAnswerField;
  pending_confirmation_value?: unknown;
  pending_confirmation_confidence?: number;
  pending_confirmation_question?: string;
  pending_confirmation_attempts?: number;
  pending_confirmation_explained?: boolean;
  confirmation_loop_count?: number;
  lead_field_jump_count?: number;
  stale_pending_reset_count?: number;
  pending_contradiction_prompt?: string;
  contradiction_prompted_keys?: string[];
  provider_used_last_turn?: LucyLlmProvider;
  user_confusion_turn?: boolean;
  awaiting_edit_stage?: boolean;
  disputed_fields?: LucyAnswerField[];
  last_disputed_field?: LucyAnswerField;
  topic_thread_id?: string;
  field_timeframe_tags?: Partial<Record<LucyAnswerField, ExtractionTimeframe>>;
  challenge_detected_turn?: boolean;
  dispute_resolved_turn?: boolean;
  stage_jump_after_dispute_turn?: boolean;
  explanation_requested_turn?: boolean;
  topic_switch_detected_turn?: boolean;
  free_conversation_mode?: boolean;
  free_extraction_phase?: LucyFreeExtractionPhase;
  free_extraction_attempt_count?: number;
  free_followup_used?: boolean;
  free_followup_pending?: boolean;
  free_missing_fields?: LucyAnswerField[];
  free_manual_gap_field?: LucyAnswerField;
  free_low_signal_streak?: number;
  free_wrap_nudge_shown?: boolean;
  free_coverage_score?: number;
  free_coverage_fields_estimated?: LucyAnswerField[];
  free_prompt_guard_hits?: number;
  free_prompt_guard_reason?: "vague" | "repeat" | "missing_question" | "style" | "none";
  free_dialogue_phase?: FreeDialoguePhase;
  free_last_dialogue_act?: FreeDialogueAct;
  free_reflect_only_count?: number;
  free_reflect_only_cooldown_until_turn?: number;
  free_topic_id?: string;
  free_topic_turn_count?: number;
  free_policy_mode?: FreePolicyMode;
  free_policy_forced_pivot_last_turn?: boolean;
  free_question_required_last_turn?: boolean;
  free_low_signal_last_turn?: boolean;
  free_high_emotion_last_turn?: boolean;
  free_robotic_pattern_hit_last_turn?: boolean;
  free_pre_guard_repeat_type_hit_last_turn?: boolean;
  free_gemini_status?:
    | "ok"
    | "retry_ok"
    | "continued_ok"
    | "timeout"
    | "http_error"
    | "empty"
    | "network_error"
    | "no_api_key"
    | "none";
  free_gemini_http_status?: number;
  free_gemini_finish_reason?: string;
  free_gemini_block_reason?: string;
  free_gemini_error_code?: string;
}

export interface RedirectPolicy {
  off_topic_total: number;
  off_topic_consecutive: number;
  category: OffTopicCategory;
  response_tier: ResponseTier;
}

export type ExtractionSource = "chat" | "quick_mode" | "inferred";

export interface ExtractionEnvelope<TValue> {
  field: LucyAnswerField;
  value: TValue;
  confidence: number;
  source: ExtractionSource;
  requires_confirmation: boolean;
  evidence_spans?: string[];
  speaker_scope?: ExtractionSpeakerScope;
  timeframe?: ExtractionTimeframe;
}

export interface LucyTurnUnderstandingSignal {
  field: LucyAnswerField;
  value: unknown;
  confidence: number;
  evidence: string;
  source: "llm" | "rule";
  evidence_spans?: string[];
  speaker_scope?: ExtractionSpeakerScope;
  timeframe?: ExtractionTimeframe;
}

export interface LucyTurnUnderstandingConfirmationNeed {
  field: LucyAnswerField;
  value: unknown;
  reason: string;
}

export interface LucyTurnUnderstanding {
  assistant_reply: string;
  signals: LucyTurnUnderstandingSignal[];
  off_topic: { category: OffTopicCategory | null; confidence: number };
  safety: { type: "self_harm" | "threat" | "hate" | null; confidence: number };
  needs_confirmation: LucyTurnUnderstandingConfirmationNeed[];
  missing_fields: LucyAnswerField[];
}

export type LucyAnswers = {
  past_attribution: PastAttribution;
  conflict_speed: ConflictSpeed;
  support_need: SupportNeed;
  emotional_openness: EmotionalOpenness;
  love_expression: LoveExpression[];
  relationship_vision: RelationshipVision;
  relational_strengths: RelationalStrength[];
  growth_intention: GrowthIntention;
};

export type LucyAnswerField = keyof LucyAnswers;

export interface LucyOption {
  value: string;
  label: string;
  hint?: string;
}

export interface LucyMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  created_at: string;
  stage_id: LucyStageId;
  kind?: "normal" | "clarification" | "redirect" | "safety" | "summary" | "nudge";
  options?: LucyOption[];
}

export interface LucySessionState {
  user_id: string;
  session_id: string;
  current_stage: LucyStageId;
  stage_states: Record<LucyStageId, StageState>;
  messages: LucyMessage[];
  extracted_data: Partial<LucyAnswers>;
  extraction_envelopes: Partial<{ [K in LucyAnswerField]: ExtractionEnvelope<LucyAnswers[K]> }>;
  control_flags: ConversationControlFlags;
  off_topic_total: number;
  off_topic_consecutive: number;
  quick_mode: boolean;
  completed: boolean;
  last_prompt_id: string | null;
  last_user_message_id: string | null;
  started_at: string;
  updated_at: string;
}

export type LucyExtractionResult<TValue> = {
  matched: boolean;
  value?: TValue;
  confidence: number;
  ambiguous: boolean;
  reason?: string;
};

export interface LucyProgress {
  stage_number: number;
  total_stages: number;
  stage_label: string;
  percent: number;
}

export interface LucySessionView {
  currentStage: LucyStageId;
  progress: LucyProgress;
  messages: LucyMessage[];
  stageStates: Record<LucyStageId, StageState>;
  controlFlags: ConversationControlFlags;
  quickMode: boolean;
  completed: boolean;
  requiredAnswers: Partial<LucyAnswers>;
  extractionEnvelopes?: Partial<{ [K in LucyAnswerField]: ExtractionEnvelope<LucyAnswers[K]> }>;
  telemetry?: {
    variant: LucyExperimentVariant;
    turn_number: number;
    stage_or_thread: string;
    session_id: string;
    model_version: string;
    prompt_version: string;
    understanding_source?: "llm" | "rule";
    fallback_reason?: "llm_timeout" | "llm_invalid_json" | "llm_empty" | "none";
    repeat_prompt_guard_triggered?: boolean;
    llm_latency_ms?: number;
    schema_validation_failed?: boolean;
    provider_used?: LucyLlmProvider;
    user_confusion_turn?: boolean;
    challenge_detected?: boolean;
    dispute_resolved?: boolean;
    stage_jump_after_dispute?: boolean;
    explanation_requested?: boolean;
    topic_switch_detected?: boolean;
    policy_mode?: FreePolicyMode;
    dialogue_phase?: FreeDialoguePhase;
    dialogue_act?: FreeDialogueAct;
    question_required?: boolean;
    low_signal?: boolean;
    high_emotion?: boolean;
    forced_pivot?: boolean;
    topic_id?: string;
    topic_turn_count?: number;
    guard_reason?: string;
    robotic_pattern_hit?: boolean;
    pre_guard_repeat_type_hit?: boolean;
  };
  freeMode?: {
    enabled: boolean;
    doneEligible: boolean;
    doneMinTurns: number;
    userTurnCount: number;
    extractionPhase: LucyFreeExtractionPhase;
    missingFields: LucyAnswerField[];
    manualGapField?: LucyAnswerField;
    manualGapOptions?: LucyOption[];
    coverageScore?: number;
    wrapNudgeEligible?: boolean;
    lowSignalStreak?: number;
  };
  promptOptions: LucyOption[];
  canSubmit: boolean;
}
