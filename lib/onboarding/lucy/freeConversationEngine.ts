import JSON5 from "json5";
import { QUICK_OPTIONS } from "@/lib/onboarding/lucy/config";
import { detectHighEmotionCue, detectSafetyType, detectVagueResponse, isUncertainAnswer } from "@/lib/onboarding/lucy/detectors";
import { extractForStage, hasAllRequiredAnswers, parseQuickModeAnswer } from "@/lib/onboarding/lucy/extractors";
import { LUCY_FREE_CHAT_SYSTEM_PROMPT, LUCY_FREE_EXTRACTION_SYSTEM_PROMPT } from "@/lib/onboarding/lucy/systemPrompt";
import type {
  FreeDialogueAct,
  FreeDialoguePhase,
  FreePolicyMode,
  LucyAnswerField,
  LucyAnswers,
  LucyFreeExtractionPhase,
  LucyMessage,
  LucyOption,
  LucySessionState,
  LucySessionView
} from "@/lib/onboarding/lucy/types";

export const LUCY_FREE_DONE_MIN_TURNS = 5;

const CHAT_RETRY_NOTICE = "I missed that for a second. Can you resend?";
const CHAT_PROVIDER_ISSUE_NOTICE = "I hit a connection issue on my side. Give me a sec and resend that.";
const CHAT_REPHRASE_NOTICE = "I couldn’t process that wording. Can you rephrase it in one sentence?";
const TRANSIENT_BACKOFF_MS = 320;

type FreeAction = "send" | "switch_quick_mode" | "finish";
type FreeLlmProvider = "gemini" | "groq";

type FreeProcessInput = {
  action: FreeAction;
  message?: string;
  clientMessageId?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    finishReason?: string;
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
};

type ChatCompletionsResponse = {
  choices?: Array<{
    finish_reason?: string;
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
  error?: {
    code?: string | number;
    type?: string;
    message?: string;
  };
};

type ExtractionConfidence = "low" | "medium" | "high";

type RawExtractionField = {
  answer?: unknown;
  confidence?: unknown;
  quote?: unknown;
};

type RawExtractionPayload = Partial<Record<LucyAnswerField, RawExtractionField>>;

type NormalizedExtractionField = {
  value: LucyAnswers[LucyAnswerField];
  confidence: number;
  quote?: string;
};

type GeminiCallStatus = "ok" | "http_error" | "empty" | "timeout" | "network_error" | "no_api_key";
type GeminiFinishReason = string | null;

type GeminiCallResult = {
  provider: FreeLlmProvider;
  text: string | null;
  status: GeminiCallStatus;
  finishReason: GeminiFinishReason;
  blockReason: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type GeneratedLucyReply = {
  content: string;
  geminiStatus: "ok" | "retry_ok" | "continued_ok" | "timeout" | "http_error" | "empty" | "network_error" | "no_api_key";
  fallbackReason: "llm_timeout" | "llm_empty" | "none";
  providerUsed: "gemini" | "groq" | "none";
  geminiFinishReason: string | null;
  geminiBlockReason: string | null;
  geminiHttpStatus: number | null;
  geminiErrorCode: string | null;
};

type FreeCoverageLevel = "low" | "medium" | "high";

type FreeSteeringSnapshot = {
  confidenceByField: Record<LucyAnswerField, number>;
  levelByField: Record<LucyAnswerField, FreeCoverageLevel>;
  lowConfidenceFields: LucyAnswerField[];
  estimatedCoveredFields: LucyAnswerField[];
  coverageScore: number;
  latestSignalFields: LucyAnswerField[];
  latestHadSignal: boolean;
  suggestedField: LucyAnswerField | null;
};

type PromptGuardReason = "vague" | "repeat" | "missing_question" | "style" | "none";
type OutgoingQuestionType = LucyAnswerField | "exploratory";
type TopicId = LucyAnswerField | "opening_rapport" | "other";

type FreeDialoguePolicy = {
  mode: FreePolicyMode;
  phase: FreeDialoguePhase;
  act: FreeDialogueAct;
  requireQuestion: boolean;
  forcedPivot: boolean;
  anchorField: LucyAnswerField;
  lowSignal: boolean;
  highEmotion: boolean;
  topicId: TopicId;
  topicTurnCount: number;
  topicBudgetRemaining: number;
};

type PromptGuardMeta = {
  content: string;
  reason: PromptGuardReason;
  questionType: OutgoingQuestionType;
  preGuardRepeatTypeHit: boolean;
  roboticPatternHit: boolean;
};

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

const STEERING_PRIORITY_ORDER: LucyAnswerField[] = [
  "conflict_speed",
  "emotional_openness",
  "relationship_vision",
  "past_attribution",
  "support_need",
  "growth_intention",
  "love_expression",
  "relational_strengths"
];
const OPENING_ANCHOR_ORDER: LucyAnswerField[] = [
  "past_attribution",
  "support_need",
  "relationship_vision",
  "emotional_openness",
  "conflict_speed",
  "growth_intention",
  "love_expression",
  "relational_strengths"
];
const POLICY_DIMENSION_PRIORITY: LucyAnswerField[] = STEERING_PRIORITY_ORDER;
const REFLECT_ONLY_MAX_TOTAL = 2;
const REFLECT_ONLY_MAX_CONSECUTIVE = 1;
const TOPIC_MAX_TURNS_DEFAULT = 2;
const TOPIC_MAX_TURNS_HIGH_EMOTION = 3;
const TRANSCRIPT_PROMPT_WINDOW = 40;
const LOW_SIGNAL_SHORT_WORD_LIMIT = 7;
const GENERIC_NEGATIVE_PATTERNS = [
  /\bnot (that )?great\b/i,
  /\bcould be better\b/i,
  /\bmeh\b/i,
  /\brough\b/i,
  /\bidk\b/i,
  /\bdepends\b/i,
  /\bnot sure\b/i,
  /\bit'?s complicated\b/i,
  /\bwhatever\b/i
];
const CONFLICT_CUE_PATTERNS = [
  /\bconflict\b/i,
  /\bargument\b/i,
  /\bfight\b/i,
  /\btension\b/i,
  /\bresolve\b/i
];
const ROBOTIC_STEM_PATTERNS = [
  /\bdifferent angle\b[:\-,]?\s*/gi,
  /\bquick shift\b[:\-,]?\s*/gi,
  /\bi need (this|that) one answer before we continue\b/gi
];

const BANNED_EXPLORATORY_PATTERNS: RegExp[] = [
  /\bhow\s+did\s+(?:that|this|it)\s+make\s+you\s+feel\b/i,
  /\bcan\s+you\s+tell\s+me\s+more\b/i,
  /\bcould\s+you\s+tell\s+me\s+more\b/i,
  /\bwhy\s+do\s+you\s+think\b/i,
  /\bdid\s+that\s+affect\s+your\s+(?:confidence|self[\s-]?esteem)\b/i,
  /\bwhat\s+did\s+you\s+learn\s+from\s+that\b/i
];

const QUESTION_TYPE_PATTERNS: Record<LucyAnswerField, RegExp[]> = {
  conflict_speed: [
    /\bconflict\b/i,
    /\btension\b/i,
    /\bargument\b/i,
    /\bfight\b/i,
    /\btalk(?:\s+it)?\s+through\b/i,
    /\bneed\s+space\b/i
  ],
  emotional_openness: [/\bvulnerab/i, /\bopen\s+up\b/i, /\btrust\b/i, /\bguarded\b/i, /\bprivate\b/i],
  relationship_vision: [/\bhealthy relationship\b/i, /\bday[\s-]?to[\s-]?day\b/i, /\blook like\b/i, /\bfuture\b/i, /\bideal\b/i],
  past_attribution: [/\bex\b/i, /\bpast\b/i, /\bended\b/i, /\bwent wrong\b/i, /\blast relationship\b/i],
  support_need: [/\bstress/i, /\bsupport\b/i, /\bneed from a partner\b/i, /\bwhen you(?:'re| are) stressed\b/i],
  growth_intention: [/\bdifferent next time\b/i, /\bwant to change\b/i, /\bthis time\b/i, /\bmoving forward\b/i],
  love_expression: [/\bshow(?:\s+someone)?\s+you\s+care\b/i, /\bshow\s+love\b/i, /\blove language\b/i, /\bcare\b/i],
  relational_strengths: [/\bbring to (?:a )?relationship\b/i, /\bstrength/i, /\bgood at\b/i, /\bproud\b/i]
};

const FIELD_LABELS: Record<LucyAnswerField, string> = {
  past_attribution: "why past relationships ended",
  conflict_speed: "your conflict pace",
  support_need: "what support helps most",
  emotional_openness: "how emotionally open you are",
  love_expression: "how you show love",
  relationship_vision: "what healthy looks like",
  relational_strengths: "what you bring to a relationship",
  growth_intention: "what you want to change this time"
};

const PAST_ATTRIBUTION_VALUES = new Set(["misaligned_goals", "conflict_comm", "emotional_disconnect", "autonomy", "external"]);
const SUPPORT_NEED_VALUES = new Set(["validation", "practical", "presence", "space", "distraction"]);
const RELATIONSHIP_VISION_VALUES = new Set(["independent", "enmeshed", "friendship", "safe", "adventure"]);
const GROWTH_INTENTION_VALUES = new Set(["depth", "balance", "chosen", "peace", "alignment"]);
const LOVE_EXPRESSION_VALUES = new Set(["acts", "time", "words", "physical", "gifts"]);
const RELATIONAL_STRENGTH_VALUES = new Set(["consistency", "loyalty", "honesty", "joy", "support"]);

const FIELD_TO_STAGE = {
  past_attribution: "past_attribution",
  conflict_speed: "conflict_speed",
  support_need: "support_need",
  emotional_openness: "emotional_openness",
  love_expression: "love_expression",
  relationship_vision: "relationship_vision",
  relational_strengths: "relational_strengths",
  growth_intention: "growth_intention"
} as const;

const TOPIC_TO_FIELDS: Array<{ pattern: RegExp; fields: LucyAnswerField[] }> = [
  { pattern: /\bex\b|last relationship|past|before|ended|ghosted|breadcrumb|situationship|hook ?ups?/i, fields: ["past_attribution", "conflict_speed", "growth_intention"] },
  { pattern: /conflict|fight|argument|tense|tension|resolve|repair|silent treatment|shut down/i, fields: ["conflict_speed", "support_need"] },
  { pattern: /stress|overwhelmed|support|listen|heard|space|help|comfort/i, fields: ["support_need", "emotional_openness"] },
  { pattern: /vulnerab|open up|trust|guarded|private|depth|share emotions/i, fields: ["emotional_openness", "relationship_vision"] },
  { pattern: /show love|love language|care|affection|time|words|touch|physical|gesture/i, fields: ["love_expression", "relational_strengths"] },
  { pattern: /healthy relationship|ideal|future|long.?term|vision|week to week|together/i, fields: ["relationship_vision", "growth_intention"] },
  { pattern: /proud|strength|bring|loyal|consisten|honest|supportive/i, fields: ["relational_strengths", "growth_intention"] },
  { pattern: /next relationship|different this time|want to change|this time|moving forward/i, fields: ["growth_intention", "relationship_vision"] }
];

const BRIDGE_QUESTION_BANK: Record<LucyAnswerField, string[]> = {
  past_attribution: [
    "Quick rewind: what felt like the core pattern that ended your last relationship?",
    "Putting it simply, what was the main thing that kept breaking the relationship?"
  ],
  conflict_speed: [
    "When tension hits, are you more talk-it-through-now or space-first?",
    "When conflict starts, what do you do first: lean in quickly or step back a bit?"
  ],
  support_need: [
    "When life stress spikes, what helps most from a partner first: listening, practical help, closeness, space, or distraction?",
    "Under stress, what support makes you feel cared for right away?"
  ],
  emotional_openness: [
    "How easy is vulnerability for you with someone you’re dating?",
    "Do you open up naturally, or more slowly once trust is built?"
  ],
  love_expression: [
    "How do you naturally show love day to day?",
    "When you care deeply, what are the top one or two ways that shows up from you?"
  ],
  relationship_vision: [
    "What does a healthy relationship look like in everyday life for you?",
    "What kind of relationship structure fits you best long-term?"
  ],
  relational_strengths: [
    "What do you think you bring to a relationship that you’re genuinely proud of?",
    "If someone described your relationship strengths, what would they say?"
  ],
  growth_intention: [
    "What is the one thing you want to be different in your next relationship?",
    "Looking ahead, what change matters most to you this time?"
  ]
};

function nowIso(): string {
  return new Date().toISOString();
}

function messageId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function addMessage(
  state: LucySessionState,
  payload: Omit<LucyMessage, "id" | "created_at">
): LucySessionState {
  const createdAt = nowIso();
  const message: LucyMessage = {
    id: messageId(),
    created_at: createdAt,
    ...payload
  };
  return {
    ...state,
    messages: [...state.messages, message],
    updated_at: createdAt
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
    stage_id: state.completed ? "closing" : state.current_stage,
    kind,
    options: options.length > 0 ? options : undefined
  });
}

function countUserTurns(messages: LucyMessage[]): number {
  return messages.filter((entry) => entry.role === "user").length;
}

function hasValue(state: LucySessionState, field: LucyAnswerField): boolean {
  const value = state.extracted_data[field];
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function normalizeFieldList(value: unknown): LucyAnswerField[] {
  if (!Array.isArray(value)) return [];
  const valid = new Set(REQUIRED_FIELDS);
  return value.filter((entry): entry is LucyAnswerField => typeof entry === "string" && valid.has(entry as LucyAnswerField));
}

function normalizePhase(value: unknown): LucyFreeExtractionPhase | undefined {
  return value === "chat" ||
    value === "extracting" ||
    value === "followup" ||
    value === "manual_gap_fill" ||
    value === "ready_to_complete"
    ? value
    : undefined;
}

function normalizeDialoguePhase(value: unknown): FreeDialoguePhase | undefined {
  return value === "opening" || value === "middle" || value === "closing" ? value : undefined;
}

function normalizeDialogueAct(value: unknown): FreeDialogueAct | undefined {
  return value === "reflect_only" ||
    value === "reflect_then_bridge" ||
    value === "clarify_then_bridge" ||
    value === "direct_bridge"
    ? value
    : undefined;
}

function normalizePolicyMode(value: unknown): FreePolicyMode | undefined {
  return value === "strict" || value === "adaptive" ? value : undefined;
}

function parsePolicyModeEnv(raw: string | undefined): FreePolicyMode {
  if (typeof raw !== "string") return "adaptive";
  const normalized = raw.trim().toLowerCase();
  if (normalized === "strict" || normalized === "adaptive") {
    return normalized;
  }
  return "adaptive";
}

function parseAdaptivePercentEnv(raw: string | undefined): number {
  const value = Number(raw ?? "100");
  if (!Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stablePercentHash(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
}

function resolvePolicyModeForState(state: LucySessionState): FreePolicyMode {
  const configured = parsePolicyModeEnv(process.env.LUCY_FREE_POLICY_MODE);
  if (configured === "strict") return "strict";
  const rolloutPercent = parseAdaptivePercentEnv(process.env.LUCY_FREE_POLICY_ADAPTIVE_PERCENT);
  if (rolloutPercent >= 100) return "adaptive";
  if (rolloutPercent <= 0) return "strict";
  const bucket = stablePercentHash(state.user_id || state.session_id || "lucy");
  return bucket < rolloutPercent ? "adaptive" : "strict";
}

function missingFields(state: LucySessionState): LucyAnswerField[] {
  return REQUIRED_FIELDS.filter((field) => !hasValue(state, field));
}

function wordCount(text: string): number {
  const parts = text.trim().split(/\s+/).filter((entry) => entry.length > 0);
  return parts.length;
}

function hasConflictCue(text: string): boolean {
  return CONFLICT_CUE_PATTERNS.some((pattern) => pattern.test(text));
}

function hasGenericNegativeSignal(text: string): boolean {
  return GENERIC_NEGATIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function inferTopicId(message: string, relatedFields: LucyAnswerField[]): TopicId {
  if (relatedFields.length > 0) return relatedFields[0] ?? "other";
  if (wordCount(message) <= LOW_SIGNAL_SHORT_WORD_LIMIT) return "opening_rapport";
  return "other";
}

function conversationPhaseFromState(
  state: LucySessionState,
  steering: FreeSteeringSnapshot
): FreeDialoguePhase {
  const userTurns = countUserTurns(state.messages);
  const missingCount = REQUIRED_FIELDS.filter((field) => steering.confidenceByField[field] < 70).length;
  if (state.completed || missingCount === 0) return "closing";
  if (userTurns <= 3 || steering.coverageScore < 38) return "opening";
  return "middle";
}

function pickNextUncoveredField(
  steering: FreeSteeringSnapshot,
  exclusions: LucyAnswerField[] = [],
  priority: LucyAnswerField[] = POLICY_DIMENSION_PRIORITY
): LucyAnswerField {
  const blocked = new Set(exclusions);
  for (const field of priority) {
    if (steering.confidenceByField[field] < 70 && !blocked.has(field)) {
      return field;
    }
  }
  for (const field of priority) {
    if (!blocked.has(field)) return field;
  }
  return priority[0]!;
}

function selectAnchorField(
  steering: FreeSteeringSnapshot,
  relatedFields: LucyAnswerField[],
  phase: FreeDialoguePhase,
  latestUserMessage: string,
  exclusions: LucyAnswerField[] = []
): LucyAnswerField {
  const blocked = new Set(exclusions);
  const conflictAllowed = hasConflictCue(latestUserMessage);
  const relatedByPriority = POLICY_DIMENSION_PRIORITY.filter(
    (field) => relatedFields.includes(field) && steering.confidenceByField[field] < 70 && !blocked.has(field)
  );
  const noConflictStartRelated = relatedByPriority.filter(
    (field) => field !== "conflict_speed" || conflictAllowed
  );
  if (noConflictStartRelated.length > 0) {
    return noConflictStartRelated[0]!;
  }

  if (phase === "opening") {
    const opening = OPENING_ANCHOR_ORDER.find((field) => {
      if (blocked.has(field)) return false;
      if (steering.confidenceByField[field] >= 70) return false;
      if (field === "conflict_speed" && !conflictAllowed) return false;
      return true;
    });
    if (opening) return opening;
  }

  const unresolved = POLICY_DIMENSION_PRIORITY.find((field) => {
    if (blocked.has(field)) return false;
    if (steering.confidenceByField[field] >= 70) return false;
    if (phase === "opening" && field === "conflict_speed" && !conflictAllowed) return false;
    return true;
  });
  if (unresolved) return unresolved;

  return pickNextUncoveredField(steering, exclusions, OPENING_ANCHOR_ORDER);
}

function shouldUseReflectOnly(
  state: LucySessionState,
  lowSignal: boolean,
  highEmotion: boolean
): boolean {
  const reflectTotal = state.control_flags.free_reflect_only_count ?? 0;
  const lastAct = normalizeDialogueAct(state.control_flags.free_last_dialogue_act);
  const userTurns = countUserTurns(state.messages);
  const cooldownUntil = state.control_flags.free_reflect_only_cooldown_until_turn ?? 0;
  const cooldownBlocked = userTurns < cooldownUntil;
  if (!highEmotion || !lowSignal) return false;
  if (reflectTotal >= REFLECT_ONLY_MAX_TOTAL) return false;
  if (lastAct === "reflect_only" && REFLECT_ONLY_MAX_CONSECUTIVE <= 1) return false;
  if (cooldownBlocked) return false;
  return true;
}

function selectDialoguePolicy(
  state: LucySessionState,
  latestUserMessage: string,
  steering: FreeSteeringSnapshot
): FreeDialoguePolicy {
  const mode = resolvePolicyModeForState(state);
  const phase = conversationPhaseFromState(state, steering);
  const relatedFields = relatedFieldsForMessage(latestUserMessage);
  const uncertain = isUncertainAnswer(latestUserMessage);
  const vague = detectVagueResponse(latestUserMessage) !== null;
  const short = wordCount(latestUserMessage) <= LOW_SIGNAL_SHORT_WORD_LIMIT;
  const lowSignal =
    !steering.latestHadSignal &&
    relatedFields.length === 0 &&
    (vague || uncertain || short || hasGenericNegativeSignal(latestUserMessage));
  const highEmotion = detectHighEmotionCue(latestUserMessage);

  const topicId = inferTopicId(latestUserMessage, relatedFields);
  const previousTopic = state.control_flags.free_topic_id;
  const nextTopicTurnCount =
    previousTopic && previousTopic === topicId
      ? (state.control_flags.free_topic_turn_count ?? 0) + 1
      : 1;
  const topicBudget = highEmotion && (topicId === "past_attribution" || topicId === "support_need")
    ? TOPIC_MAX_TURNS_HIGH_EMOTION
    : TOPIC_MAX_TURNS_DEFAULT;
  const forcedPivot = nextTopicTurnCount > topicBudget;
  const topicBudgetRemaining = Math.max(0, topicBudget - nextTopicTurnCount);
  const lowSignalStreak = state.control_flags.free_low_signal_streak ?? 0;
  const anchorField = selectAnchorField(
    steering,
    relatedFields,
    phase,
    latestUserMessage,
    previousTopic && REQUIRED_FIELDS.includes(previousTopic as LucyAnswerField)
      ? [previousTopic as LucyAnswerField]
      : []
  );

  let act: FreeDialogueAct = "direct_bridge";
  let requireQuestion = true;
  if (mode === "strict") {
    act = "direct_bridge";
    requireQuestion = true;
  } else if (forcedPivot) {
    act = "direct_bridge";
    requireQuestion = true;
  } else if (shouldUseReflectOnly(state, lowSignal, highEmotion)) {
    act = "reflect_only";
    requireQuestion = false;
  } else if (phase === "opening" && lowSignal) {
    act = "reflect_then_bridge";
    requireQuestion = true;
  } else if (lowSignalStreak >= 2) {
    act = "clarify_then_bridge";
    requireQuestion = true;
  } else {
    act = "direct_bridge";
    requireQuestion = true;
  }

  return {
    mode,
    phase,
    act,
    requireQuestion,
    forcedPivot,
    anchorField,
    lowSignal,
    highEmotion,
    topicId,
    topicTurnCount: nextTopicTurnCount,
    topicBudgetRemaining
  };
}

function confidenceLevel(confidence: number): FreeCoverageLevel {
  if (confidence >= 80) return "high";
  if (confidence >= 60) return "medium";
  return "low";
}

function normalizeQuestionForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function relatedFieldsForMessage(message: string): LucyAnswerField[] {
  const ranked: LucyAnswerField[] = [];
  for (const entry of TOPIC_TO_FIELDS) {
    if (!entry.pattern.test(message)) continue;
    for (const field of entry.fields) {
      if (!ranked.includes(field)) ranked.push(field);
    }
  }
  return ranked;
}

function estimateLatestSignalFields(message: string): LucyAnswerField[] {
  const hits: LucyAnswerField[] = [];
  for (const field of REQUIRED_FIELDS) {
    const stage = FIELD_TO_STAGE[field];
    const extracted = extractForStage(stage, message);
    const adjusted = extracted.confidence - (extracted.ambiguous ? 12 : 0);
    if (extracted.matched && adjusted >= 68) {
      hits.push(field);
    }
  }
  return hits;
}

function estimateSteeringSnapshot(state: LucySessionState, latestUserMessage: string): FreeSteeringSnapshot {
  const confidenceByField = REQUIRED_FIELDS.reduce(
    (acc, field) => {
      acc[field] = 0;
      return acc;
    },
    {} as Record<LucyAnswerField, number>
  );

  for (const field of REQUIRED_FIELDS) {
    const envelopeConfidence = state.extraction_envelopes[field]?.confidence ?? 0;
    if (envelopeConfidence > confidenceByField[field]) {
      confidenceByField[field] = Math.max(0, Math.min(100, Math.round(envelopeConfidence)));
    } else if (hasValue(state, field)) {
      confidenceByField[field] = Math.max(confidenceByField[field], 84);
    }
  }

  for (const entry of state.messages) {
    if (entry.role !== "user") continue;
    for (const field of REQUIRED_FIELDS) {
      const stage = FIELD_TO_STAGE[field];
      const extracted = extractForStage(stage, entry.content);
      if (!extracted.matched) continue;
      const adjusted = Math.max(0, Math.min(95, Math.round(extracted.confidence - (extracted.ambiguous ? 12 : 0))));
      if (adjusted > confidenceByField[field]) {
        confidenceByField[field] = adjusted;
      }
    }
  }

  const levelByField = REQUIRED_FIELDS.reduce(
    (acc, field) => {
      acc[field] = confidenceLevel(confidenceByField[field]);
      return acc;
    },
    {} as Record<LucyAnswerField, FreeCoverageLevel>
  );

  const estimatedCoveredFields = REQUIRED_FIELDS.filter((field) => confidenceByField[field] >= 70);
  const lowConfidenceFields = [...REQUIRED_FIELDS]
    .filter((field) => confidenceByField[field] < 70)
    .sort((left, right) => confidenceByField[left] - confidenceByField[right]);
  const latestSignalFields = estimateLatestSignalFields(latestUserMessage);
  const latestHadSignal = latestSignalFields.length > 0;
  const related = relatedFieldsForMessage(latestUserMessage);
  const unresolvedByPriority = STEERING_PRIORITY_ORDER.filter((field) => confidenceByField[field] < 70);
  const relatedByPriority = STEERING_PRIORITY_ORDER.filter(
    (field) => confidenceByField[field] < 70 && related.includes(field)
  );
  const suggestedField = relatedByPriority[0] ?? unresolvedByPriority[0] ?? null;
  const scoreTotal = REQUIRED_FIELDS.reduce((sum, field) => sum + confidenceByField[field], 0);
  const coverageScore = Math.max(0, Math.min(100, Math.round(scoreTotal / REQUIRED_FIELDS.length)));

  return {
    confidenceByField,
    levelByField,
    lowConfidenceFields,
    estimatedCoveredFields,
    coverageScore,
    latestSignalFields,
    latestHadSignal,
    suggestedField
  };
}

function pickBridgeQuestion(field: LucyAnswerField, seed: number): string {
  const questions = BRIDGE_QUESTION_BANK[field] ?? BRIDGE_QUESTION_BANK.past_attribution;
  if (questions.length === 0) return "What feels most true for you there?";
  return questions[Math.abs(seed) % questions.length] ?? questions[0]!;
}

function normalizeLucyStyle(content: string): { text: string; roboticPatternHit: boolean } {
  let normalized = content.replace(/\s+/g, " ").trim();
  let roboticPatternHit = false;
  for (const pattern of ROBOTIC_STEM_PATTERNS) {
    if (pattern.test(normalized)) roboticPatternHit = true;
    pattern.lastIndex = 0;
    normalized = normalized.replace(pattern, "");
  }
  normalized = normalized.replace(/\s+/g, " ").trim();
  return { text: normalized, roboticPatternHit };
}

function clampSentenceCount(content: string, maxSentences: number): string {
  const parts = splitSentences(content);
  if (parts.length <= maxSentences) {
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }
  return parts
    .slice(0, maxSentences)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeQuestions(content: string): string {
  const nonQuestions = splitSentences(content)
    .filter((entry) => !entry.includes("?"))
    .map((entry) => entry.replace(/\?/g, "").trim());
  return nonQuestions.join(" ").replace(/\s+/g, " ").trim();
}

function buildReflectOnlyReply(content: string, policy: FreeDialoguePolicy): string {
  const style = normalizeLucyStyle(content);
  const stripped = removeQuestions(style.text);
  const first = shortAckSentence(stripped || style.text || "Got it.");
  const second = policy.highEmotion
    ? "You're not overreacting."
    : "You're making sense.";
  return clampSentenceCount(`${first} ${second}`, 2);
}

function applyPromptGuard(
  state: LucySessionState,
  content: string,
  latestUserMessage: string,
  steering: FreeSteeringSnapshot,
  policy: FreeDialoguePolicy
): PromptGuardMeta {
  const styleBefore = normalizeLucyStyle(content);
  const normalized = styleBefore.text;
  const seed = countUserTurns(state.messages) + latestUserMessage.length;
  if (!policy.requireQuestion) {
    const reflectReply = buildReflectOnlyReply(normalized, policy);
    return {
      content: reflectReply,
      reason: styleBefore.roboticPatternHit ? "style" : "none",
      questionType: "exploratory",
      preGuardRepeatTypeHit: false,
      roboticPatternHit: styleBefore.roboticPatternHit
    };
  }

  const ack = shortAckSentence(removeQuestions(normalized) || normalized);
  const existingQuestions = splitQuestionLikeSegments(normalized);
  const firstQuestion = existingQuestions[0]?.replace(/\s+/g, " ").trim() ?? "";
  const recentQuestions = recentAssistantQuestions(state.messages, 3).map((entry) => normalizeQuestionStem(entry));
  const recentTypes = recentAssistantQuestionTypes(state.messages, 4);
  const lastType = recentTypes.at(-1);

  let reason: PromptGuardReason = "none";
  let question = firstQuestion;
  let questionType: OutgoingQuestionType = question ? classifyQuestionType(question) : "exploratory";
  const preGuardRepeatTypeHit =
    questionType !== "exploratory" &&
    lastType === questionType &&
    lastConsecutiveTypeRun(recentTypes, questionType) >= 1;

  if (!question) {
    reason = "missing_question";
  } else {
    const repeatedQuestion = recentQuestions.includes(normalizeQuestionStem(question));
    const repeatedType = preGuardRepeatTypeHit;
    const exploratory = questionType === "exploratory" || isBannedExploratoryQuestion(question);

    if (exploratory) {
      reason = "vague";
    } else if (repeatedQuestion || repeatedType) {
      reason = "repeat";
    }
  }

  const exclusions: OutgoingQuestionType[] = [];
  if (questionType !== "exploratory") exclusions.push(questionType);
  if (lastType && lastType !== "exploratory") exclusions.push(lastType);

  const anchorRepeatBlocked =
    lastType === policy.anchorField &&
    lastConsecutiveTypeRun(recentTypes, policy.anchorField) >= 1;
  let replacementField = policy.anchorField;
  if (anchorRepeatBlocked) {
    replacementField = pickPriorityField(steering, [...exclusions, replacementField]);
  }

  if (reason !== "none") {
    question = pickBridgeQuestion(replacementField, seed);
    questionType = replacementField;
  } else if (policy.forcedPivot && questionType !== replacementField) {
    question = pickBridgeQuestion(replacementField, seed);
    questionType = replacementField;
    reason = "style";
  } else if (policy.lowSignal && policy.phase === "opening" && questionType !== policy.anchorField) {
    question = pickBridgeQuestion(replacementField, seed);
    questionType = replacementField;
    reason = "style";
  } else if (questionType !== "exploratory" && steering.confidenceByField[questionType] >= 70) {
    question = pickBridgeQuestion(replacementField, seed);
    questionType = replacementField;
    reason = "style";
  }

  if (questionType === "exploratory") {
    question = pickBridgeQuestion(replacementField, seed);
    questionType = replacementField;
    reason = reason === "none" ? "vague" : reason;
  }

  const finalQuestion = question.endsWith("?") ? question : `${question.replace(/[.!]+$/, "")}?`;
  const finalContent = `${ack} ${finalQuestion}`.replace(/\s+/g, " ").trim();
  if (!finalQuestion) {
    const fallbackField = pickPriorityField(steering, lastType ? [lastType] : [policy.anchorField]);
    return {
      content: `${ack} ${pickBridgeQuestion(fallbackField, seed)}`.replace(/\s+/g, " ").trim(),
      reason: "missing_question",
      questionType: fallbackField,
      preGuardRepeatTypeHit,
      roboticPatternHit: styleBefore.roboticPatternHit
    };
  }

  const normalizedFinal = normalizeLucyStyle(finalContent);
  return {
    content: clampSentenceCount(normalizedFinal.text, 2),
    reason,
    questionType,
    preGuardRepeatTypeHit,
    roboticPatternHit: styleBefore.roboticPatternHit || normalizedFinal.roboticPatternHit
  };
}

function shouldShowWrapNudge(state: LucySessionState, steering: FreeSteeringSnapshot): boolean {
  if (state.control_flags.free_wrap_nudge_shown) return false;
  const userTurns = countUserTurns(state.messages);
  return userTurns >= 10 && steering.coverageScore >= 78 && steering.lowConfidenceFields.length <= 2;
}

function safeQuote(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, 220);
}

function isNotCovered(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.trim().toUpperCase() === "NOT_COVERED";
}

function parseConfidence(value: unknown): ExtractionConfidence {
  if (typeof value !== "string") return "medium";
  const normalized = value.trim().toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
  return "medium";
}

function confidenceToNumber(confidence: ExtractionConfidence): number {
  if (confidence === "high") return 90;
  if (confidence === "low") return 55;
  return 72;
}

function normalizeListAnswer(raw: unknown, allowed: Set<string>): string[] | null {
  if (isNotCovered(raw)) return null;
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw
          .split(/,|\/| and /gi)
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : [];

  const normalized = list
    .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
    .filter((entry) => entry.length > 0 && allowed.has(entry));

  const deduped = [...new Set(normalized)].slice(0, 2);
  return deduped.length > 0 ? deduped : null;
}

function normalizeScalarAnswer(raw: unknown, allowed: Set<string>): string | null {
  if (isNotCovered(raw)) return null;
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  return allowed.has(normalized) ? normalized : null;
}

function normalizeNumericAnswer(raw: unknown): number | null {
  if (isNotCovered(raw)) return null;
  const numeric =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim().length > 0
        ? Number(raw.trim())
        : Number.NaN;
  return Number.isFinite(numeric) && numeric >= 1 && numeric <= 5 ? numeric : null;
}

function normalizeAnswer(field: LucyAnswerField, raw: unknown): LucyAnswers[LucyAnswerField] | null {
  if (field === "past_attribution") {
    return normalizeScalarAnswer(raw, PAST_ATTRIBUTION_VALUES) as LucyAnswers[LucyAnswerField] | null;
  }
  if (field === "conflict_speed" || field === "emotional_openness") {
    return normalizeNumericAnswer(raw) as LucyAnswers[LucyAnswerField] | null;
  }
  if (field === "support_need") {
    return normalizeScalarAnswer(raw, SUPPORT_NEED_VALUES) as LucyAnswers[LucyAnswerField] | null;
  }
  if (field === "love_expression") {
    return normalizeListAnswer(raw, LOVE_EXPRESSION_VALUES) as LucyAnswers[LucyAnswerField] | null;
  }
  if (field === "relationship_vision") {
    return normalizeScalarAnswer(raw, RELATIONSHIP_VISION_VALUES) as LucyAnswers[LucyAnswerField] | null;
  }
  if (field === "relational_strengths") {
    return normalizeListAnswer(raw, RELATIONAL_STRENGTH_VALUES) as LucyAnswers[LucyAnswerField] | null;
  }
  return normalizeScalarAnswer(raw, GROWTH_INTENTION_VALUES) as LucyAnswers[LucyAnswerField] | null;
}

function normalizeExtractionPayload(payload: unknown): {
  values: Partial<Record<LucyAnswerField, NormalizedExtractionField>>;
} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { values: {} };
  }
  const data = payload as RawExtractionPayload;
  const values: Partial<Record<LucyAnswerField, NormalizedExtractionField>> = {};

  for (const field of REQUIRED_FIELDS) {
    const entry = data[field];
    if (!entry || typeof entry !== "object") continue;
    const normalized = normalizeAnswer(field, entry.answer);
    if (normalized === null) continue;
    const confidence = confidenceToNumber(parseConfidence(entry.confidence));
    values[field] = {
      value: normalized as LucyAnswers[LucyAnswerField],
      confidence,
      quote: safeQuote(entry.quote)
    };
  }

  return { values };
}

function applyExtractionValues(
  state: LucySessionState,
  values: Partial<Record<LucyAnswerField, NormalizedExtractionField>>,
  source: "inferred" | "quick_mode"
): LucySessionState {
  let next = state;
  for (const field of REQUIRED_FIELDS) {
    const row = values[field];
    if (!row) continue;

    next = {
      ...next,
      extracted_data: {
        ...next.extracted_data,
        [field]: row.value as never
      },
      extraction_envelopes: {
        ...next.extraction_envelopes,
        [field]: {
          field,
          value: row.value as never,
          confidence: row.confidence,
          source,
          requires_confirmation: false,
          evidence_spans: row.quote ? [row.quote] : undefined
        }
      }
    };
  }

  return next;
}

function transcript(messages: LucyMessage[], maxMessages: number): string {
  return messages
    .slice(-maxMessages)
    .map((entry) => `${entry.role === "assistant" ? "Lucy" : "User"}: ${entry.content}`)
    .join("\n");
}

function splitSentences(content: string): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?]+[.!?]?/g) ?? [];
  return sentences.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

function splitQuestionLikeSegments(content: string): string[] {
  return splitSentences(content).filter((entry) => entry.includes("?"));
}

function normalizeQuestionStem(question: string): string {
  return normalizeQuestionForComparison(question).replace(/\s+/g, " ").trim();
}

function isBannedExploratoryQuestion(question: string): boolean {
  const normalized = normalizeQuestionStem(question);
  if (!normalized) return false;
  return BANNED_EXPLORATORY_PATTERNS.some((pattern) => pattern.test(normalized));
}

function classifyQuestionType(question: string): OutgoingQuestionType {
  if (!question.trim()) return "exploratory";
  if (isBannedExploratoryQuestion(question)) return "exploratory";

  for (const field of STEERING_PRIORITY_ORDER) {
    const patterns = QUESTION_TYPE_PATTERNS[field];
    if (patterns?.some((pattern) => pattern.test(question))) {
      return field;
    }
  }

  return "exploratory";
}

function recentAssistantQuestions(messages: LucyMessage[], maxQuestions = 2): string[] {
  const collected: string[] = [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (!entry || entry.role !== "assistant") continue;
    const questions = splitQuestionLikeSegments(entry.content);
    if (questions.length === 0) continue;
    for (let q = questions.length - 1; q >= 0; q -= 1) {
      collected.push(questions[q]!);
      if (collected.length >= maxQuestions) {
        return collected.reverse();
      }
    }
  }
  return collected.reverse();
}

function recentAssistantQuestionTypes(messages: LucyMessage[], maxQuestions = 4): OutgoingQuestionType[] {
  return recentAssistantQuestions(messages, maxQuestions).map((question) => classifyQuestionType(question));
}

function lastConsecutiveTypeRun(types: OutgoingQuestionType[], target: OutgoingQuestionType): number {
  let run = 0;
  for (let index = types.length - 1; index >= 0; index -= 1) {
    if (types[index] !== target) break;
    run += 1;
  }
  return run;
}

function shortAckSentence(content: string): string {
  const first = splitSentences(content).find((entry) => !entry.includes("?"));
  const fallback = "Got it.";
  if (!first) return fallback;
  const cleaned = first.replace(/[!?]+$/, ".").trim();
  if (!cleaned) return fallback;
  const words = cleaned.split(/\s+/).slice(0, 16).join(" ");
  return /[.!?]$/.test(words) ? words : `${words}.`;
}

function pickPriorityField(
  steering: FreeSteeringSnapshot,
  exclusions: OutgoingQuestionType[] = []
): LucyAnswerField {
  const blocked = new Set(exclusions.filter((entry): entry is LucyAnswerField => entry !== "exploratory"));
  for (const field of STEERING_PRIORITY_ORDER) {
    if (steering.confidenceByField[field] < 70 && !blocked.has(field)) {
      return field;
    }
  }
  if (steering.suggestedField && !blocked.has(steering.suggestedField)) {
    return steering.suggestedField;
  }
  for (const field of STEERING_PRIORITY_ORDER) {
    if (!blocked.has(field)) return field;
  }
  return STEERING_PRIORITY_ORDER[0]!;
}

function extractJsonText(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1).trim();
  return raw.trim();
}

function parseJsonLike(raw: string): unknown {
  const jsonText = extractJsonText(raw);
  try {
    return JSON.parse(jsonText);
  } catch {
    try {
      return JSON5.parse(jsonText) as unknown;
    } catch {
      return null;
    }
  }
}

function geminiApiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null;
}

function geminiModel(): string {
  return process.env.LUCY_GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
}

function groqApiKey(): string | null {
  return process.env.GROQ_API_KEY?.trim() || null;
}

function groqModel(): string {
  return process.env.LUCY_GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
}

function geminiCandidateModels(): string[] {
  const preferred = geminiModel();
  const candidates = [preferred, "gemini-2.5-flash-lite", "gemini-2.5-flash", "gemini-2.0-flash"];
  const seen = new Set<string>();
  return candidates.filter((model) => {
    if (!model || seen.has(model)) return false;
    seen.add(model);
    return true;
  });
}

function geminiTimeoutMs(): number {
  const raw = Number(process.env.LUCY_LLM_TIMEOUT_MS ?? "15000");
  if (!Number.isFinite(raw)) return 15000;
  return Math.max(8000, Math.round(raw));
}

function extractGeminiCandidate(
  payload: GeminiResponse
): { text: string | null; finishReason: GeminiFinishReason; blockReason: string | null } {
  const first = payload.candidates?.[0];
  const text = (first?.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  return {
    text: text.length > 0 ? text : null,
    finishReason:
      typeof first?.finishReason === "string" && first.finishReason.trim().length > 0
        ? first.finishReason.trim()
        : null,
    blockReason:
      typeof payload.promptFeedback?.blockReason === "string" && payload.promptFeedback.blockReason.trim().length > 0
        ? payload.promptFeedback.blockReason.trim()
        : null
  };
}

function parseGeminiErrorPayload(payload: unknown): { errorCode: string | null; errorMessage: string | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { errorCode: null, errorMessage: null };
  }
  const root = payload as Record<string, unknown>;
  const errorNode = root.error;
  if (!errorNode || typeof errorNode !== "object" || Array.isArray(errorNode)) {
    return { errorCode: null, errorMessage: null };
  }
  const error = errorNode as Record<string, unknown>;
  const errorCode =
    typeof error.status === "string" && error.status.trim().length > 0
      ? error.status.trim()
      : typeof error.code === "number" && Number.isFinite(error.code)
        ? String(Math.round(error.code))
        : null;
  const errorMessage =
    typeof error.message === "string" && error.message.trim().length > 0 ? error.message.trim() : null;
  return { errorCode, errorMessage };
}

function parseGroqErrorPayload(payload: unknown): { errorCode: string | null; errorMessage: string | null } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { errorCode: null, errorMessage: null };
  }
  const root = payload as Record<string, unknown>;
  const errorNode = root.error;
  if (!errorNode || typeof errorNode !== "object" || Array.isArray(errorNode)) {
    return { errorCode: null, errorMessage: null };
  }
  const error = errorNode as Record<string, unknown>;
  const rawCode = error.code;
  const rawType = error.type;
  const errorCode =
    typeof rawCode === "string" && rawCode.trim().length > 0
      ? rawCode.trim()
      : typeof rawCode === "number" && Number.isFinite(rawCode)
        ? String(Math.round(rawCode))
        : typeof rawType === "string" && rawType.trim().length > 0
          ? rawType.trim()
          : null;
  const errorMessage =
    typeof error.message === "string" && error.message.trim().length > 0 ? error.message.trim() : null;
  return { errorCode, errorMessage };
}

function extractChatCompletionText(payload: ChatCompletionsResponse): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    const text = content.trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part) => (part.type === "text" ? part.text ?? "" : ""))
      .join("")
      .trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

function extractGroqFinishReason(payload: ChatCompletionsResponse): string | null {
  const reason = payload.choices?.[0]?.finish_reason;
  return typeof reason === "string" && reason.trim().length > 0 ? reason.trim() : null;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function waitMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  opts?: { json?: boolean; maxTokens?: number; temperature?: number }
): Promise<GeminiCallResult> {
  const apiKey = geminiApiKey();
  if (!apiKey) {
    return {
      provider: "gemini",
      text: null,
      status: "no_api_key",
      finishReason: null,
      blockReason: null,
      httpStatus: null,
      errorCode: "NO_API_KEY",
      errorMessage: "Missing GEMINI_API_KEY or GOOGLE_API_KEY"
    };
  }

  let lastStatus: GeminiCallStatus = "http_error";
  let lastFinishReason: GeminiFinishReason = null;
  let lastBlockReason: string | null = null;
  let lastHttpStatus: number | null = null;
  let lastErrorCode: string | null = null;
  let lastErrorMessage: string | null = null;
  for (const model of geminiCandidateModels()) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    try {
      const response = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            contents: [
              {
                role: "user",
                parts: [{ text: userPrompt }]
              }
            ],
            generationConfig: {
              temperature: opts?.temperature ?? 0.7,
              maxOutputTokens: opts?.maxTokens ?? 640,
              ...(opts?.json ? { responseMimeType: "application/json" } : {})
            }
          })
        },
        geminiTimeoutMs()
      );

      if (!response.ok) {
        lastHttpStatus = response.status;
        const errorPayload = await response.json().catch(() => null);
        const parsedError = parseGeminiErrorPayload(errorPayload);
        lastErrorCode = parsedError.errorCode;
        lastErrorMessage = parsedError.errorMessage;
        const upperErrorCode = parsedError.errorCode?.trim().toUpperCase() ?? "";
        if (response.status === 429 || upperErrorCode === "RESOURCE_EXHAUSTED") {
          return {
            provider: "gemini",
            text: null,
            status: "http_error",
            finishReason: null,
            blockReason: null,
            httpStatus: response.status,
            errorCode: parsedError.errorCode,
            errorMessage: parsedError.errorMessage
          };
        }
        lastStatus = "http_error";
        continue;
      }
      const payload = (await response.json()) as GeminiResponse;
      const { text, finishReason, blockReason } = extractGeminiCandidate(payload);
      lastFinishReason = finishReason;
      lastBlockReason = blockReason;
      if (!text) {
        lastStatus = "empty";
        continue;
      }
      return {
        provider: "gemini",
        text,
        status: "ok",
        finishReason,
        blockReason,
        httpStatus: response.status,
        errorCode: null,
        errorMessage: null
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return {
          provider: "gemini",
          text: null,
          status: "timeout",
          finishReason: null,
          blockReason: null,
          httpStatus: null,
          errorCode: "TIMEOUT",
          errorMessage: error.message
        };
      }
      lastStatus = "network_error";
      lastErrorCode = error instanceof Error && error.name ? error.name : "NETWORK_ERROR";
      lastErrorMessage = error instanceof Error && error.message ? error.message : "Network request failed";
    }
  }

  return {
    provider: "gemini",
    text: null,
    status: lastStatus,
    finishReason: lastFinishReason,
    blockReason: lastBlockReason,
    httpStatus: lastHttpStatus,
    errorCode: lastErrorCode,
    errorMessage: lastErrorMessage
  };
}

async function callGroq(
  systemPrompt: string,
  userPrompt: string,
  opts?: { json?: boolean; maxTokens?: number; temperature?: number }
): Promise<GeminiCallResult> {
  const apiKey = groqApiKey();
  if (!apiKey) {
    return {
      provider: "groq",
      text: null,
      status: "no_api_key",
      finishReason: null,
      blockReason: null,
      httpStatus: null,
      errorCode: "NO_API_KEY",
      errorMessage: "Missing GROQ_API_KEY"
    };
  }

  const endpoint = "https://api.groq.com/openai/v1/chat/completions";
  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: groqModel(),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          max_tokens: opts?.maxTokens ?? 640,
          temperature: opts?.temperature ?? 0.7,
          ...(opts?.json ? { response_format: { type: "json_object" } } : {})
        })
      },
      geminiTimeoutMs()
    );

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null);
      const parsedError = parseGroqErrorPayload(errorPayload);
      return {
        provider: "groq",
        text: null,
        status: "http_error",
        finishReason: null,
        blockReason: null,
        httpStatus: response.status,
        errorCode: parsedError.errorCode,
        errorMessage: parsedError.errorMessage
      };
    }

    const payload = (await response.json()) as ChatCompletionsResponse;
    const text = extractChatCompletionText(payload);
    const finishReason = extractGroqFinishReason(payload);
    if (!text) {
      return {
        provider: "groq",
        text: null,
        status: "empty",
        finishReason,
        blockReason: null,
        httpStatus: response.status,
        errorCode: null,
        errorMessage: null
      };
    }

    return {
      provider: "groq",
      text,
      status: "ok",
      finishReason,
      blockReason: null,
      httpStatus: response.status,
      errorCode: null,
      errorMessage: null
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return {
        provider: "groq",
        text: null,
        status: "timeout",
        finishReason: null,
        blockReason: null,
        httpStatus: null,
        errorCode: "TIMEOUT",
        errorMessage: error.message
      };
    }
    return {
      provider: "groq",
      text: null,
      status: "network_error",
      finishReason: null,
      blockReason: null,
      httpStatus: null,
      errorCode: error instanceof Error && error.name ? error.name : "NETWORK_ERROR",
      errorMessage: error instanceof Error && error.message ? error.message : "Network request failed"
    };
  }
}

function normalizeGeminiReplyForChat(raw: string): string | null {
  const normalized = raw.trim();
  if (!normalized) return null;
  return normalized;
}

function isMaxTokensFinishReason(reason: GeminiFinishReason): boolean {
  if (!reason) return false;
  return reason.trim().toUpperCase() === "MAX_TOKENS";
}

function buildContinuationPrompt(
  state: LucySessionState,
  latestUserMessage: string,
  partialAssistantReply: string
): string {
  return [
    "Conversation history (most recent last):",
    transcript(state.messages, TRANSCRIPT_PROMPT_WINDOW) || "(no history)",
    "",
    `Latest user message: ${latestUserMessage}`,
    "",
    "Your previous response was cut off because of output length.",
    "Continue exactly from where you stopped.",
    "Do not restart. Do not repeat earlier text. Return continuation text only.",
    "",
    "Previous partial assistant response:",
    partialAssistantReply
  ].join("\n");
}

function mergeContinuationReply(firstText: string, continuationText: string): string | null {
  const left = firstText.trimEnd();
  let right = continuationText.trimStart();
  if (!left || !right) return null;

  const maxOverlap = Math.min(left.length, right.length, 140);
  for (let size = maxOverlap; size >= 16; size -= 1) {
    const leftTail = left.slice(-size).toLowerCase();
    const rightHead = right.slice(0, size).toLowerCase();
    if (leftTail === rightHead) {
      right = right.slice(size).trimStart();
      break;
    }
  }

  if (!right) return left;
  const separator = /[\s([{'"“]$/.test(left) || /^[\s)\]}'"”.,!?;:]/.test(right) ? "" : " ";
  const merged = `${left}${separator}${right}`.trim();
  return merged.length > 0 ? merged : null;
}

function buildFreeChatPrompt(
  state: LucySessionState,
  latestUserMessage: string,
  steering: FreeSteeringSnapshot,
  policy: FreeDialoguePolicy
): string {
  const userTurnCount = countUserTurns(state.messages);
  const recentQuestions = recentAssistantQuestions(state.messages, 2);
  const recentTypes = recentAssistantQuestionTypes(state.messages, 3);
  const lastType = recentTypes.at(-1) ?? "none";
  const renderedCoverage = REQUIRED_FIELDS
    .map((field) => `${field}:${steering.levelByField[field]}(${steering.confidenceByField[field]})`)
    .join(" | ");
  const unresolvedPriority = STEERING_PRIORITY_ORDER.filter((field) => steering.confidenceByField[field] < 70);
  const openingContextUsers = state.messages
    .filter((entry) => entry.role === "user")
    .slice(0, 2)
    .map((entry) => entry.content)
    .join(" | ");
  const openingContextAssistant =
    state.messages.find((entry) => entry.role === "assistant")?.content ?? "none";

  return [
    "Conversation history (most recent last):",
    transcript(state.messages, TRANSCRIPT_PROMPT_WINDOW) || "(no history)",
    "",
    `Latest user message: ${latestUserMessage}`,
    `Opening context users: ${openingContextUsers || "none"}`,
    `Opening context first assistant: ${openingContextAssistant}`,
    "",
    "Runtime steering context:",
    `- user_turn_count: ${userTurnCount}`,
    `- last_assistant_questions: ${recentQuestions.join(" | ") || "none"}`,
    `- last_assistant_question_type: ${lastType}`,
    `- latest_turn_signal_hit: ${steering.latestHadSignal ? "yes" : "no"}`,
    `- latest_turn_signal_fields: ${steering.latestSignalFields.join(", ") || "none"}`,
    `- estimated_coverage_score: ${steering.coverageScore}`,
    `- estimated_covered_fields: ${steering.estimatedCoveredFields.join(", ") || "none"}`,
    `- low_confidence_fields: ${steering.lowConfidenceFields.join(", ") || "none"}`,
    `- unresolved_by_priority: ${unresolvedPriority.join(", ") || "none"}`,
    `- preferred_next_dimension: ${steering.suggestedField ?? "none"}`,
    `- confidence_by_dimension: ${renderedCoverage}`,
    `- dialogue_phase: ${policy.phase}`,
    `- dialogue_act: ${policy.act}`,
    `- question_required: ${policy.requireQuestion ? "yes" : "no"}`,
    `- low_signal: ${policy.lowSignal ? "yes" : "no"}`,
    `- high_emotion: ${policy.highEmotion ? "yes" : "no"}`,
    `- topic_id: ${policy.topicId}`,
    `- topic_turn_count: ${policy.topicTurnCount}`,
    `- topic_budget_remaining: ${policy.topicBudgetRemaining}`,
    `- forced_pivot: ${policy.forcedPivot ? "yes" : "no"}`,
    `- anchor_dimension: ${policy.anchorField}`,
    `- policy_mode: ${policy.mode}`,
    "",
    "Adaptive pacing rules:",
    "- Use one short, human acknowledgment first.",
    "- If question_required=yes, ask one forward-moving question only.",
    "- If question_required=no, send a reflective response with no question mark.",
    "- Never ask banned exploratory prompts.",
    "- Do not repeat the same question type on back-to-back turns.",
    "- If low_signal=yes and opening phase, bridge gently from their words before deeper pivots.",
    "- Limited reflective turns are allowed, but the next turn must progress.",
    "Reply as Lucy now. Follow system rules exactly."
  ].join("\n");
}

function fallbackReasonFromStatus(status: GeminiCallStatus): "llm_timeout" | "llm_empty" {
  if (status === "timeout") return "llm_timeout";
  return "llm_empty";
}

function isBlockedByGemini(result: Pick<GeminiCallResult, "finishReason" | "blockReason">): boolean {
  if (result.blockReason) return true;
  const finish = result.finishReason?.trim().toUpperCase();
  return finish === "SAFETY" || finish === "PROHIBITED_CONTENT";
}

function isTransientGeminiFailure(status: GeminiCallStatus, httpStatus: number | null): boolean {
  if (status === "timeout" || status === "network_error") return true;
  if (status !== "http_error") return false;
  if (httpStatus === null) return false;
  return httpStatus === 429 || httpStatus >= 500;
}

function shouldFailoverToGroq(result: GeminiCallResult): boolean {
  if (result.provider !== "gemini") return false;
  if (!groqApiKey()) return false;
  if (result.status === "no_api_key") return true;
  if (result.status === "timeout" || result.status === "network_error") return true;
  if (result.status !== "http_error") return false;
  const code = result.errorCode?.trim().toUpperCase() ?? "";
  if (code === "RESOURCE_EXHAUSTED") return true;
  if (result.httpStatus === 429) return true;
  return typeof result.httpStatus === "number" && result.httpStatus >= 500;
}

async function tryGroqChatFailover(
  systemPrompt: string,
  prompt: string
): Promise<GeneratedLucyReply | null> {
  const groq = await callGroq(systemPrompt, prompt, {
    json: false,
    maxTokens: 640,
    temperature: 0.75
  });
  const groqUsable = groq.text ? normalizeGeminiReplyForChat(groq.text) : null;
  if (groqUsable) {
    return {
      content: groqUsable,
      geminiStatus: "retry_ok",
      fallbackReason: "none",
      providerUsed: "groq",
      geminiFinishReason: groq.finishReason,
      geminiBlockReason: groq.blockReason,
      geminiHttpStatus: groq.httpStatus,
      geminiErrorCode: groq.errorCode
    };
  }
  return null;
}

function fallbackNoticeForFailure(status: GeminiCallStatus, result: GeminiCallResult): string {
  if (isBlockedByGemini(result)) return CHAT_REPHRASE_NOTICE;
  if (status === "no_api_key") return CHAT_PROVIDER_ISSUE_NOTICE;
  if (isTransientGeminiFailure(status, result.httpStatus)) return CHAT_PROVIDER_ISSUE_NOTICE;
  if (status === "http_error") return CHAT_PROVIDER_ISSUE_NOTICE;
  return CHAT_RETRY_NOTICE;
}

async function generateLucyReply(
  state: LucySessionState,
  latestUserMessage: string,
  steering: FreeSteeringSnapshot,
  policy: FreeDialoguePolicy
): Promise<GeneratedLucyReply> {
  const prompt = buildFreeChatPrompt(state, latestUserMessage, steering, policy);
  const first = await callGemini(LUCY_FREE_CHAT_SYSTEM_PROMPT, prompt, {
    json: false,
    maxTokens: 640,
    temperature: 0.75
  });
  const firstUsable = first.text ? normalizeGeminiReplyForChat(first.text) : null;
  if (firstUsable && !isMaxTokensFinishReason(first.finishReason)) {
    return {
      content: firstUsable,
      geminiStatus: "ok",
      fallbackReason: "none",
      providerUsed: first.provider,
      geminiFinishReason: first.finishReason,
      geminiBlockReason: first.blockReason,
      geminiHttpStatus: first.httpStatus,
      geminiErrorCode: first.errorCode
    };
  }

  if (firstUsable && isMaxTokensFinishReason(first.finishReason)) {
    const continuationPrompt = buildContinuationPrompt(state, latestUserMessage, firstUsable);
    const continuation = await callGemini(LUCY_FREE_CHAT_SYSTEM_PROMPT, continuationPrompt, {
      json: false,
      maxTokens: 640,
      temperature: 0.65
    });
    const continuationUsable = continuation.text ? normalizeGeminiReplyForChat(continuation.text) : null;
    const merged = continuationUsable ? mergeContinuationReply(firstUsable, continuationUsable) : null;
    if (merged) {
      return {
        content: merged,
        geminiStatus: "continued_ok",
        fallbackReason: "none",
        providerUsed: continuation.provider,
        geminiFinishReason: continuation.finishReason ?? first.finishReason,
        geminiBlockReason: continuation.blockReason,
        geminiHttpStatus: continuation.httpStatus,
        geminiErrorCode: continuation.errorCode
      };
    }
    const continuationStatus = continuationUsable ? "empty" : continuation.status;
    if (shouldFailoverToGroq(continuation)) {
      const failover = await tryGroqChatFailover(LUCY_FREE_CHAT_SYSTEM_PROMPT, prompt);
      if (failover) return failover;
    }
    return {
      content: fallbackNoticeForFailure(continuationStatus, continuation),
      geminiStatus: continuationStatus,
      fallbackReason: fallbackReasonFromStatus(continuationStatus),
      providerUsed: "none",
      geminiFinishReason: continuation.finishReason,
      geminiBlockReason: continuation.blockReason,
      geminiHttpStatus: continuation.httpStatus,
      geminiErrorCode: continuation.errorCode
    };
  }

  if (shouldFailoverToGroq(first)) {
    const failover = await tryGroqChatFailover(LUCY_FREE_CHAT_SYSTEM_PROMPT, prompt);
    if (failover) return failover;
  }

  if (first.status !== "no_api_key") {
    if (isTransientGeminiFailure(first.status, first.httpStatus)) {
      await waitMs(TRANSIENT_BACKOFF_MS);
    }
    const retry = await callGemini(LUCY_FREE_CHAT_SYSTEM_PROMPT, prompt, {
      json: false,
      maxTokens: 640,
      temperature: 0.75
    });
    const retryUsable = retry.text ? normalizeGeminiReplyForChat(retry.text) : null;
    if (retryUsable) {
      return {
        content: retryUsable,
        geminiStatus: "retry_ok",
        fallbackReason: "none",
        providerUsed: retry.provider,
        geminiFinishReason: retry.finishReason,
        geminiBlockReason: retry.blockReason,
        geminiHttpStatus: retry.httpStatus,
        geminiErrorCode: retry.errorCode
      };
    }

    const retryStatus = retry.text ? "empty" : retry.status;
    if (shouldFailoverToGroq(retry)) {
      const failover = await tryGroqChatFailover(LUCY_FREE_CHAT_SYSTEM_PROMPT, prompt);
      if (failover) return failover;
    }
    return {
      content: fallbackNoticeForFailure(retryStatus, retry),
      geminiStatus: retryStatus,
      fallbackReason: fallbackReasonFromStatus(retryStatus),
      providerUsed: "none",
      geminiFinishReason: retry.finishReason,
      geminiBlockReason: retry.blockReason,
      geminiHttpStatus: retry.httpStatus,
      geminiErrorCode: retry.errorCode
    };
  }

  const firstStatus = first.text ? "empty" : first.status;
  return {
    content: fallbackNoticeForFailure(firstStatus, first),
    geminiStatus: firstStatus,
    fallbackReason: fallbackReasonFromStatus(firstStatus),
    providerUsed: "none",
    geminiFinishReason: first.finishReason,
    geminiBlockReason: first.blockReason,
    geminiHttpStatus: first.httpStatus,
    geminiErrorCode: first.errorCode
  };
}

async function runFinalExtraction(messages: LucyMessage[]): Promise<Partial<Record<LucyAnswerField, NormalizedExtractionField>>> {
  const prompt = [
    "Full transcript:",
    transcript(messages, 120) || "(no transcript)",
    "",
    "Return JSON exactly as requested."
  ].join("\n");
  let attempt = await callGemini(LUCY_FREE_EXTRACTION_SYSTEM_PROMPT, prompt, {
    json: true,
    maxTokens: 1600,
    temperature: 0.1
  });
  if (!attempt.text && shouldFailoverToGroq(attempt)) {
    attempt = await callGroq(LUCY_FREE_EXTRACTION_SYSTEM_PROMPT, prompt, {
      json: true,
      maxTokens: 1600,
      temperature: 0.1
    });
  }
  if (!attempt.text) return {};
  const parsed = parseJsonLike(attempt.text);
  return normalizeExtractionPayload(parsed).values;
}

function withFreeFlags(
  state: LucySessionState,
  patch: Partial<LucySessionState["control_flags"]>
): LucySessionState {
  return {
    ...state,
    control_flags: {
      ...state.control_flags,
      ...patch
    }
  };
}

function safetyReply(type: "self_harm" | "threat" | "hate"): string {
  if (type === "self_harm") {
    return "I’m really glad you said that. I can’t support crises directly here, so please contact local emergency services or a crisis line right now.";
  }
  if (type === "threat") {
    return "I can’t help with harming anyone. If there’s immediate danger, contact local emergency services now.";
  }
  return "I can’t continue with hateful language. If you want to continue, we can keep this respectful and focused.";
}

function manualQuestion(field: LucyAnswerField): string {
  return `Quick fill so I can finalize: ${FIELD_LABELS[field]}.`;
}

function followupPrompt(fields: LucyAnswerField[]): string {
  const rendered = fields.map((field) => FIELD_LABELS[field]).join(", ");
  return `Quick follow-up before I run matches: I still need ${rendered}. Keep it short and direct.`;
}

function finalizeConversation(state: LucySessionState): LucySessionState {
  const next = withFreeFlags(
    {
      ...state,
      current_stage: "closing",
      completed: true
    },
    {
      free_extraction_phase: "ready_to_complete",
      free_followup_pending: false,
      free_missing_fields: [],
      free_manual_gap_field: undefined
    }
  );
  return addAssistantMessage(next, "Okay, I think I’ve got a good sense of you. Let me find your matches.", "summary");
}

function startManualGapFill(state: LucySessionState, fields: LucyAnswerField[], intro?: string): LucySessionState {
  const field = fields[0];
  if (!field) return state;
  const next = withFreeFlags(state, {
    free_extraction_phase: "manual_gap_fill",
    free_missing_fields: fields,
    free_manual_gap_field: field,
    free_followup_pending: false
  });
  const content = intro ? `${intro}\n${manualQuestion(field)}` : manualQuestion(field);
  return addAssistantMessage(next, content, "clarification", QUICK_OPTIONS[field] ?? []);
}

function ensureFreeFlagDefaults(state: LucySessionState): LucySessionState {
  const existingPhase = normalizePhase(state.control_flags.free_extraction_phase);
  const currentPhase: LucyFreeExtractionPhase =
    existingPhase ??
    (state.completed ? "ready_to_complete" : "chat");

  return withFreeFlags(state, {
    free_conversation_mode: true,
    free_extraction_phase: currentPhase,
    free_extraction_attempt_count:
      typeof state.control_flags.free_extraction_attempt_count === "number" &&
      Number.isFinite(state.control_flags.free_extraction_attempt_count)
        ? state.control_flags.free_extraction_attempt_count
        : 0,
    free_followup_used: Boolean(state.control_flags.free_followup_used),
    free_followup_pending: Boolean(state.control_flags.free_followup_pending),
    free_missing_fields: normalizeFieldList(state.control_flags.free_missing_fields),
    free_manual_gap_field:
      state.control_flags.free_manual_gap_field &&
      REQUIRED_FIELDS.includes(state.control_flags.free_manual_gap_field)
        ? state.control_flags.free_manual_gap_field
        : undefined,
    free_low_signal_streak:
      typeof state.control_flags.free_low_signal_streak === "number" &&
      Number.isFinite(state.control_flags.free_low_signal_streak)
        ? Math.max(0, Math.round(state.control_flags.free_low_signal_streak))
        : 0,
    free_wrap_nudge_shown: Boolean(state.control_flags.free_wrap_nudge_shown),
    free_coverage_score:
      typeof state.control_flags.free_coverage_score === "number" &&
      Number.isFinite(state.control_flags.free_coverage_score)
        ? Math.max(0, Math.min(100, Math.round(state.control_flags.free_coverage_score)))
        : 0,
    free_coverage_fields_estimated: normalizeFieldList(state.control_flags.free_coverage_fields_estimated),
    free_prompt_guard_hits:
      typeof state.control_flags.free_prompt_guard_hits === "number" &&
      Number.isFinite(state.control_flags.free_prompt_guard_hits)
        ? Math.max(0, Math.round(state.control_flags.free_prompt_guard_hits))
        : 0,
    free_prompt_guard_reason:
      state.control_flags.free_prompt_guard_reason === "vague" ||
      state.control_flags.free_prompt_guard_reason === "repeat" ||
      state.control_flags.free_prompt_guard_reason === "missing_question" ||
      state.control_flags.free_prompt_guard_reason === "style" ||
      state.control_flags.free_prompt_guard_reason === "none"
        ? state.control_flags.free_prompt_guard_reason
        : "none",
    free_dialogue_phase:
      normalizeDialoguePhase(state.control_flags.free_dialogue_phase) ??
      (state.completed ? "closing" : "opening"),
    free_last_dialogue_act:
      normalizeDialogueAct(state.control_flags.free_last_dialogue_act) ?? "direct_bridge",
    free_reflect_only_count:
      typeof state.control_flags.free_reflect_only_count === "number" &&
      Number.isFinite(state.control_flags.free_reflect_only_count)
        ? Math.max(0, Math.round(state.control_flags.free_reflect_only_count))
        : 0,
    free_reflect_only_cooldown_until_turn:
      typeof state.control_flags.free_reflect_only_cooldown_until_turn === "number" &&
      Number.isFinite(state.control_flags.free_reflect_only_cooldown_until_turn)
        ? Math.max(0, Math.round(state.control_flags.free_reflect_only_cooldown_until_turn))
        : 0,
    free_topic_id:
      typeof state.control_flags.free_topic_id === "string" && state.control_flags.free_topic_id.trim().length > 0
        ? state.control_flags.free_topic_id.trim()
        : "opening_rapport",
    free_topic_turn_count:
      typeof state.control_flags.free_topic_turn_count === "number" &&
      Number.isFinite(state.control_flags.free_topic_turn_count)
        ? Math.max(0, Math.round(state.control_flags.free_topic_turn_count))
        : 0,
    free_policy_mode: normalizePolicyMode(state.control_flags.free_policy_mode) ?? resolvePolicyModeForState(state),
    free_policy_forced_pivot_last_turn: Boolean(state.control_flags.free_policy_forced_pivot_last_turn),
    free_question_required_last_turn: Boolean(state.control_flags.free_question_required_last_turn),
    free_low_signal_last_turn: Boolean(state.control_flags.free_low_signal_last_turn),
    free_high_emotion_last_turn: Boolean(state.control_flags.free_high_emotion_last_turn),
    free_robotic_pattern_hit_last_turn: Boolean(state.control_flags.free_robotic_pattern_hit_last_turn),
    free_pre_guard_repeat_type_hit_last_turn: Boolean(state.control_flags.free_pre_guard_repeat_type_hit_last_turn),
    free_gemini_status:
      state.control_flags.free_gemini_status === "ok" ||
      state.control_flags.free_gemini_status === "retry_ok" ||
      state.control_flags.free_gemini_status === "continued_ok" ||
      state.control_flags.free_gemini_status === "timeout" ||
      state.control_flags.free_gemini_status === "http_error" ||
      state.control_flags.free_gemini_status === "empty" ||
      state.control_flags.free_gemini_status === "network_error" ||
      state.control_flags.free_gemini_status === "no_api_key" ||
      state.control_flags.free_gemini_status === "none"
        ? state.control_flags.free_gemini_status
        : "none",
    free_gemini_http_status:
      typeof state.control_flags.free_gemini_http_status === "number" &&
      Number.isFinite(state.control_flags.free_gemini_http_status) &&
      state.control_flags.free_gemini_http_status >= 100 &&
      state.control_flags.free_gemini_http_status <= 599
        ? Math.round(state.control_flags.free_gemini_http_status)
        : undefined,
    free_gemini_finish_reason:
      typeof state.control_flags.free_gemini_finish_reason === "string" &&
      state.control_flags.free_gemini_finish_reason.trim().length > 0
        ? state.control_flags.free_gemini_finish_reason.trim()
        : undefined,
    free_gemini_block_reason:
      typeof state.control_flags.free_gemini_block_reason === "string" &&
      state.control_flags.free_gemini_block_reason.trim().length > 0
        ? state.control_flags.free_gemini_block_reason.trim()
        : undefined,
    free_gemini_error_code:
      typeof state.control_flags.free_gemini_error_code === "string" &&
      state.control_flags.free_gemini_error_code.trim().length > 0
        ? state.control_flags.free_gemini_error_code.trim()
        : undefined
  });
}

async function runExtractionAndAdvance(state: LucySessionState): Promise<LucySessionState> {
  const extractingState = withFreeFlags(state, {
    free_extraction_phase: "extracting",
    free_extraction_attempt_count: (state.control_flags.free_extraction_attempt_count ?? 0) + 1
  });

  const values = await runFinalExtraction(extractingState.messages);
  const extracted = applyExtractionValues(extractingState, values, "inferred");
  const missing = missingFields(extracted);

  if (missing.length === 0) {
    return finalizeConversation(extracted);
  }

  if (!extracted.control_flags.free_followup_used) {
    const withFollowup = withFreeFlags(extracted, {
      free_followup_used: true,
      free_followup_pending: true,
      free_extraction_phase: "followup",
      free_missing_fields: missing,
      free_manual_gap_field: undefined
    });
    return addAssistantMessage(withFollowup, followupPrompt(missing), "clarification");
  }

  return startManualGapFill(extracted, missing, "I still need a couple quick picks.");
}

function applyManualAnswer(state: LucySessionState, field: LucyAnswerField, rawInput: string): LucySessionState {
  const quickPick = parseQuickModeAnswer(field, rawInput);
  const normalized = normalizeAnswer(field, quickPick ?? rawInput);
  if (normalized === null) {
    const retry = withFreeFlags(state, {
      free_extraction_phase: "manual_gap_fill",
      free_manual_gap_field: field
    });
    return addAssistantMessage(retry, `Pick the closest option for ${FIELD_LABELS[field]}.`, "clarification", QUICK_OPTIONS[field] ?? []);
  }

  const applied = applyExtractionValues(
    state,
    {
      [field]: {
        value: normalized as LucyAnswers[LucyAnswerField],
        confidence: 95
      }
    },
    "quick_mode"
  );
  const missing = missingFields(applied);
  if (missing.length === 0) {
    return finalizeConversation(withFreeFlags(applied, { free_missing_fields: [] }));
  }
  return startManualGapFill(applied, missing);
}

async function handleUserMessage(state: LucySessionState, message: string, clientMessageId?: string): Promise<LucySessionState> {
  const text = message.trim();
  if (!text) {
    return addAssistantMessage(state, CHAT_RETRY_NOTICE);
  }

  let next = addMessage(state, {
    role: "user",
    content: text,
    stage_id: state.completed ? "closing" : "opening"
  });
  next = {
    ...next,
    last_user_message_id: clientMessageId ?? null
  };

  const safety = detectSafetyType(text);
  if (safety) {
    const flagged = withFreeFlags(next, {
      safety_flag: true,
      needs_manual_review: true,
      free_extraction_phase: "chat",
      free_gemini_status: "none",
      free_gemini_http_status: undefined,
      free_gemini_finish_reason: undefined,
      free_gemini_block_reason: undefined,
      free_gemini_error_code: undefined,
      provider_used_last_turn: "none",
      fallback_reason: "none"
    });
    return addAssistantMessage(flagged, safetyReply(safety), "safety");
  }

  const manualField = next.control_flags.free_manual_gap_field;
  if (manualField) {
    return applyManualAnswer(next, manualField, text);
  }

  if (next.control_flags.free_followup_pending) {
    const cleared = withFreeFlags(next, {
      free_followup_pending: false
    });
    return runExtractionAndAdvance(cleared);
  }

  const steering = estimateSteeringSnapshot(next, text);
  const policy = selectDialoguePolicy(next, text, steering);
  const nextLowSignalStreak = policy.lowSignal ? (next.control_flags.free_low_signal_streak ?? 0) + 1 : 0;
  const chatState = withFreeFlags(next, {
    free_extraction_phase: "chat",
    free_coverage_score: steering.coverageScore,
    free_coverage_fields_estimated: steering.estimatedCoveredFields,
    free_low_signal_streak: nextLowSignalStreak,
    free_policy_mode: policy.mode,
    free_dialogue_phase: policy.phase,
    free_topic_id: policy.topicId,
    free_topic_turn_count: policy.topicTurnCount
  });
  const generated = await generateLucyReply(chatState, text, steering, policy);
  const providerUsed = generated.providerUsed;
  const providerNoneStyle = normalizeLucyStyle(generated.content);
  const guardedReply =
    providerUsed === "none"
      ? {
          content: providerNoneStyle.text,
          reason: "none" as PromptGuardReason,
          questionType: "exploratory" as OutgoingQuestionType,
          preGuardRepeatTypeHit: false,
          roboticPatternHit: providerNoneStyle.roboticPatternHit
        }
      : applyPromptGuard(chatState, generated.content, text, steering, policy);
  const wrapNudge = shouldShowWrapNudge(chatState, steering);
  const finalContent = wrapNudge
    ? `${guardedReply.content} If this feels accurate, you can tap “I’m done” any time.`
    : guardedReply.content;
  const reflectOnlyCount =
    (chatState.control_flags.free_reflect_only_count ?? 0) + (policy.act === "reflect_only" ? 1 : 0);
  const reflectCooldown =
    policy.act === "reflect_only"
      ? countUserTurns(chatState.messages) + 1
      : Math.max(0, chatState.control_flags.free_reflect_only_cooldown_until_turn ?? 0);
  const withReplyFlags = withFreeFlags(chatState, {
    free_gemini_status: generated.geminiStatus,
    free_gemini_http_status: generated.geminiHttpStatus ?? undefined,
    free_gemini_finish_reason: generated.geminiFinishReason ?? undefined,
    free_gemini_block_reason: generated.geminiBlockReason ?? undefined,
    free_gemini_error_code: generated.geminiErrorCode ?? undefined,
    provider_used_last_turn: providerUsed,
    fallback_reason: generated.fallbackReason,
    free_prompt_guard_hits:
      (chatState.control_flags.free_prompt_guard_hits ?? 0) + (guardedReply.reason === "none" ? 0 : 1),
    free_prompt_guard_reason: guardedReply.reason,
    free_wrap_nudge_shown: wrapNudge ? true : Boolean(chatState.control_flags.free_wrap_nudge_shown),
    free_dialogue_phase: policy.phase,
    free_last_dialogue_act: policy.act,
    free_reflect_only_count: reflectOnlyCount,
    free_reflect_only_cooldown_until_turn: reflectCooldown,
    free_topic_id: policy.topicId,
    free_topic_turn_count: policy.topicTurnCount,
    free_policy_mode: policy.mode,
    free_policy_forced_pivot_last_turn: policy.forcedPivot,
    free_question_required_last_turn: policy.requireQuestion,
    free_low_signal_last_turn: policy.lowSignal,
    free_high_emotion_last_turn: policy.highEmotion,
    free_robotic_pattern_hit_last_turn: guardedReply.roboticPatternHit,
    free_pre_guard_repeat_type_hit_last_turn: guardedReply.preGuardRepeatTypeHit
  });

  return addAssistantMessage(withReplyFlags, finalContent, "normal");
}

async function handleFinish(state: LucySessionState): Promise<LucySessionState> {
  if (state.control_flags.free_manual_gap_field) {
    const field = state.control_flags.free_manual_gap_field;
    return addAssistantMessage(
      state,
      `I’m almost done. Quick pick for ${FIELD_LABELS[field]}.`,
      "clarification",
      QUICK_OPTIONS[field] ?? []
    );
  }

  const userTurns = countUserTurns(state.messages);
  if (userTurns < LUCY_FREE_DONE_MIN_TURNS) {
    return addAssistantMessage(
      state,
      `I want a little more context first. Share a bit more, then tap “I’m done” (${userTurns}/${LUCY_FREE_DONE_MIN_TURNS}).`
    );
  }

  return runExtractionAndAdvance(state);
}

export function enableFreeConversationMode(state: LucySessionState): LucySessionState {
  return ensureFreeFlagDefaults(state);
}

export async function processLucyFreeConversationAction(
  state: LucySessionState,
  input: FreeProcessInput
): Promise<LucySessionState> {
  const next = ensureFreeFlagDefaults(state);

  if (input.clientMessageId && next.last_user_message_id === input.clientMessageId) {
    return next;
  }

  if (input.action === "finish") {
    return handleFinish(next);
  }

  return handleUserMessage(next, input.message ?? "", input.clientMessageId);
}

export function buildLucySessionViewFree(state: LucySessionState): LucySessionView {
  const withFlags = ensureFreeFlagDefaults(state);
  const userTurns = countUserTurns(withFlags.messages);
  const missing = missingFields(withFlags);
  const manualField = withFlags.control_flags.free_manual_gap_field;
  const phase = withFlags.control_flags.free_extraction_phase ?? (withFlags.completed ? "ready_to_complete" : "chat");
  const canSubmit = withFlags.completed && hasAllRequiredAnswers(withFlags.extracted_data);

  return {
    currentStage: withFlags.completed ? "closing" : "opening",
    progress: {
      stage_number: withFlags.completed ? 8 : 0,
      total_stages: 8,
      stage_label: withFlags.completed ? "Summary" : "Conversation",
      percent: withFlags.completed ? 100 : Math.min(95, Math.round((userTurns / LUCY_FREE_DONE_MIN_TURNS) * 100))
    },
    messages: withFlags.messages,
    stageStates: withFlags.stage_states,
    controlFlags: withFlags.control_flags,
    quickMode: false,
    completed: withFlags.completed,
    requiredAnswers: withFlags.extracted_data,
    extractionEnvelopes: withFlags.extraction_envelopes,
    telemetry: {
      variant: withFlags.control_flags.experiment_variant,
      turn_number: userTurns,
      stage_or_thread: phase,
      session_id: withFlags.session_id,
      model_version: withFlags.control_flags.model_version,
      prompt_version: withFlags.control_flags.prompt_version,
      provider_used: withFlags.control_flags.provider_used_last_turn ?? "none",
      fallback_reason: withFlags.control_flags.fallback_reason ?? "none",
      policy_mode: withFlags.control_flags.free_policy_mode ?? "adaptive",
      dialogue_phase: withFlags.control_flags.free_dialogue_phase ?? "opening",
      dialogue_act: withFlags.control_flags.free_last_dialogue_act ?? "direct_bridge",
      question_required: withFlags.control_flags.free_question_required_last_turn ?? true,
      low_signal: withFlags.control_flags.free_low_signal_last_turn ?? false,
      high_emotion: withFlags.control_flags.free_high_emotion_last_turn ?? false,
      forced_pivot: withFlags.control_flags.free_policy_forced_pivot_last_turn ?? false,
      topic_id: withFlags.control_flags.free_topic_id ?? "opening_rapport",
      topic_turn_count: withFlags.control_flags.free_topic_turn_count ?? 0,
      guard_reason: withFlags.control_flags.free_prompt_guard_reason ?? "none",
      robotic_pattern_hit: withFlags.control_flags.free_robotic_pattern_hit_last_turn ?? false,
      pre_guard_repeat_type_hit: withFlags.control_flags.free_pre_guard_repeat_type_hit_last_turn ?? false
    },
    freeMode: {
      enabled: true,
      doneEligible: userTurns >= LUCY_FREE_DONE_MIN_TURNS,
      doneMinTurns: LUCY_FREE_DONE_MIN_TURNS,
      userTurnCount: userTurns,
      extractionPhase: phase,
      missingFields: missing,
      manualGapField: manualField,
      manualGapOptions: manualField ? (QUICK_OPTIONS[manualField] ?? []) : undefined,
      coverageScore: withFlags.control_flags.free_coverage_score ?? 0,
      wrapNudgeEligible:
        !withFlags.control_flags.free_wrap_nudge_shown &&
        userTurns >= 10 &&
        (withFlags.control_flags.free_coverage_score ?? 0) >= 78 &&
        missing.length <= 2,
      lowSignalStreak: withFlags.control_flags.free_low_signal_streak ?? 0
    },
    promptOptions: manualField ? (QUICK_OPTIONS[manualField] ?? []) : [],
    canSubmit
  };
}
