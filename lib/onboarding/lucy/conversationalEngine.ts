import {
  CONFLICT_SPEED_LABELS,
  EMOTIONAL_OPENNESS_LABELS,
  QUICK_OPTIONS,
  REQUIRED_STAGE_FIELDS
} from "@/lib/onboarding/lucy/config";
import {
  buildRedirectPolicy,
  detectOffTopicCategory,
  detectSafetyType,
  getRedirectResponse,
  isAffirmative,
  isClarificationQuestion,
  isExternalCapabilityRequest,
  isInterpretationChallenge,
  isMetaQuestionAboutTerm,
  isUncertainAnswer
} from "@/lib/onboarding/lucy/detectors";
import { extractForStage } from "@/lib/onboarding/lucy/extractors";
import { maybeGenerateLucyAssistantMessage } from "@/lib/onboarding/lucy/llm";
import { understandTurn } from "@/lib/onboarding/lucy/understanding";
import type {
  ExtractionSpeakerScope,
  ExtractionTimeframe,
  LucyAnswerField,
  LucyAnswers,
  LucyMessage,
  LucyOption,
  LucyTurnUnderstandingSignal,
  LucySessionState,
  LucyStageId
} from "@/lib/onboarding/lucy/types";

const CONFIRMATION_DECISION_OPTIONS: LucyOption[] = [
  { value: "yes", label: "Yes, keep it" },
  { value: "no", label: "No, change it" }
];

const LOW_SIGNAL_ACK_PATTERNS: RegExp[] = [
  /^ok(?:ay)?[.!]*$/i,
  /^sounds good[.!]*$/i,
  /^got it[.!]*$/i,
  /^sure[.!]*$/i,
  /^yes[.!]*$/i,
  /^yep[.!]*$/i,
  /^alright[.!]*$/i,
  /^fine[.!]*$/i
];

type Candidate = {
  field: LucyAnswerField;
  value: unknown;
  confidence: number;
  source: "chat" | "quick_mode" | "inferred";
  reason: string;
  evidenceSpans?: string[];
  speakerScope?: ExtractionSpeakerScope;
  timeframe?: ExtractionTimeframe;
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

const FIELD_TO_STAGE: Record<LucyAnswerField, LucyStageId> = {
  past_attribution: "past_attribution",
  conflict_speed: "conflict_speed",
  support_need: "support_need",
  emotional_openness: "emotional_openness",
  love_expression: "love_expression",
  relationship_vision: "relationship_vision",
  relational_strengths: "relational_strengths",
  growth_intention: "growth_intention"
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
    stage_id: state.current_stage,
    kind,
    options: options.length > 0 ? options : undefined
  });
}

function hasValue(state: LucySessionState, field: LucyAnswerField): boolean {
  const value = state.extracted_data[field];
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}

function fieldConfidence(state: LucySessionState, field: LucyAnswerField): number {
  return state.extraction_envelopes[field]?.confidence ?? 0;
}

function missingFields(state: LucySessionState, threshold = 70): LucyAnswerField[] {
  return REQUIRED_FIELDS.filter((field) => !hasValue(state, field) || fieldConfidence(state, field) < threshold);
}

function markOpeningComplete(state: LucySessionState): LucySessionState {
  const timestamp = nowIso();
  return {
    ...state,
    stage_states: {
      ...state.stage_states,
      opening: {
        ...state.stage_states.opening,
        status: "complete",
        confidence: 100,
        completed_at: timestamp
      }
    },
    current_stage: "past_attribution",
    updated_at: timestamp
  };
}

function getNextStageForCoverage(state: LucySessionState): LucyStageId {
  const next = missingFields(state, 70)[0];
  if (!next) return "closing";
  return FIELD_TO_STAGE[next];
}

function updateCurrentStageFromCoverage(state: LucySessionState): LucySessionState {
  return {
    ...state,
    current_stage: getNextStageForCoverage(state)
  };
}

function upsertField(
  state: LucySessionState,
  field: LucyAnswerField,
  value: unknown,
  confidence: number,
  source: "chat" | "quick_mode" | "inferred",
  requiresConfirmation: boolean,
  meta?: {
    evidenceSpans?: string[];
    speakerScope?: ExtractionSpeakerScope;
    timeframe?: ExtractionTimeframe;
  }
): LucySessionState {
  const stage = FIELD_TO_STAGE[field];
  const previousConfidence = state.stage_states[stage].confidence;
  const nextStatus = !requiresConfirmation && confidence >= 75 ? "complete" : "active";
  const evidenceSpans = (meta?.evidenceSpans ?? []).filter((entry) => entry.trim().length > 0).slice(0, 3);
  const timeframeTags = { ...(state.control_flags.field_timeframe_tags ?? {}) };
  if (meta?.timeframe) {
    timeframeTags[field] = meta.timeframe;
  }
  return {
    ...state,
    extracted_data: {
      ...state.extracted_data,
      [field]: value as never
    },
    extraction_envelopes: {
      ...state.extraction_envelopes,
      [field]: {
        field,
        value: value as never,
        confidence,
        source,
        requires_confirmation: requiresConfirmation,
        evidence_spans: evidenceSpans.length > 0 ? evidenceSpans : undefined,
        speaker_scope: meta?.speakerScope,
        timeframe: meta?.timeframe
      }
    },
    stage_states: {
      ...state.stage_states,
      [stage]: {
        ...state.stage_states[stage],
        status: nextStatus,
        confidence: Math.max(previousConfidence, confidence),
        completed_at: nextStatus === "complete" ? nowIso() : state.stage_states[stage].completed_at,
        requires_confirmation: requiresConfirmation
      }
    },
    control_flags: {
      ...state.control_flags,
      field_timeframe_tags: timeframeTags
    }
  };
}

function contradictionPrompt(data: Partial<LucyAnswers>): { key: string; prompt: string } | null {
  if (data.conflict_speed && data.support_need) {
    if (data.conflict_speed <= 2 && data.support_need === "space") {
      return {
        key: `conflict_support:${data.conflict_speed}:${data.support_need}`,
        prompt: "I hear both: you like to resolve conflict quickly, but you also need space under stress. Are both true in different moments?"
      };
    }
  }
  if (data.emotional_openness && data.growth_intention) {
    if (data.emotional_openness >= 4 && data.growth_intention === "depth") {
      return {
        key: `openness_growth:${data.emotional_openness}:${data.growth_intention}`,
        prompt: "Quick check: you described a private style, and also wanting deeper honesty. Is that a growth goal for you right now?"
      };
    }
  }
  return null;
}

function buildSynthesis(state: LucySessionState): string {
  const data = state.extracted_data;
  const lines: string[] = [];
  lines.push("I think I’ve got your pattern.");
  lines.push(
    `- Past dynamic: ${data.past_attribution ?? "not fully clear yet"}`
  );
  lines.push(`- Conflict pace: ${data.conflict_speed ?? "not fully clear yet"}`);
  lines.push(`- Stress support: ${data.support_need ?? "not fully clear yet"}`);
  lines.push(`- Relationship vision: ${data.relationship_vision ?? "not fully clear yet"}`);
  lines.push(`- Growth focus: ${data.growth_intention ?? "not fully clear yet"}`);
  lines.push("Does this feel accurate? If yes, I’ll lock it. If not, tell me what to change.");
  return lines.join("\n");
}

function buildDirectQuestion(field: LucyAnswerField): string {
  switch (field) {
    case "past_attribution":
      return "What felt like the core issue in your last relationship?";
    case "conflict_speed":
      return "When conflict shows up, what do you usually do first?";
    case "support_need":
      return "When stress spikes, what kind of support helps most first?";
    case "emotional_openness":
      return "How easy is it for you to open up emotionally with a partner?";
    case "love_expression":
      return "How do you naturally show love day-to-day? One or two patterns is enough.";
    case "relationship_vision":
      return "What does your ideal relationship feel like week to week?";
    case "relational_strengths":
      return "What are your top one or two relationship strengths?";
    case "growth_intention":
      return "What do you most want to be different this time?";
    default:
      return "Tell me a bit more so I can get this right.";
  }
}

function formatNumericScale(field: LucyAnswerField, value: unknown): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  if (field === "conflict_speed") {
    const label = CONFLICT_SPEED_LABELS[numeric];
    return label ? `${numeric}/5 (${label})` : `${numeric}/5`;
  }
  if (field === "emotional_openness") {
    const label = EMOTIONAL_OPENNESS_LABELS[numeric];
    return label ? `${numeric}/5 (${label})` : `${numeric}/5`;
  }
  return String(value);
}

function renderConfirmationValue(field: LucyAnswerField, value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (field === "conflict_speed" || field === "emotional_openness") {
    return formatNumericScale(field, value);
  }
  return String(value);
}

function buildScaleLegend(field: LucyAnswerField): string {
  if (field === "conflict_speed") {
    return "Scale: 1=talk now, 3=depends, 5=space first.";
  }
  if (field === "emotional_openness") {
    return "Scale: 1=very open, 3=mixed, 5=mostly private.";
  }
  return "";
}

function matchesPendingValue(field: LucyAnswerField, pendingValue: unknown, rawInput: string): boolean {
  const text = rawInput.trim().toLowerCase();
  if (!text) return false;
  if (Array.isArray(pendingValue)) {
    const values = pendingValue.map((entry) => String(entry).toLowerCase());
    return values.some((entry) => text === entry || text.includes(entry));
  }
  if (field === "conflict_speed" || field === "emotional_openness") {
    const numeric = Number(pendingValue);
    const incoming = Number(text);
    return Number.isFinite(numeric) && Number.isFinite(incoming) && numeric === incoming;
  }
  const expected = String(pendingValue ?? "").toLowerCase();
  return text === expected || text.includes(expected);
}

function buildConfirmationQuestion(field: LucyAnswerField, value: unknown): string {
  const rendered = renderConfirmationValue(field, value);
  const legend = buildScaleLegend(field);
  switch (field) {
    case "past_attribution":
      return `I’m hearing the core pattern was ${rendered}. Is that right?`;
    case "conflict_speed":
      return `I’m hearing your conflict pace as ${rendered}. ${legend} Does that sound right?`;
    case "support_need":
      return `So your first support need is ${rendered}. Does that sound right?`;
    case "emotional_openness":
      return `I’m hearing your emotional openness as ${rendered}. ${legend} Does that sound right?`;
    case "love_expression":
      return `I’m hearing your love expression is ${rendered}. Is that a fit?`;
    case "relationship_vision":
      return `It sounds like your relationship vision is ${rendered}. Right?`;
    case "relational_strengths":
      return `I have your strengths as ${rendered}. Does that sound right?`;
    case "growth_intention":
      return `Your top growth focus sounds like ${rendered}. Is that right?`;
    default:
      return "I want to make sure I got that right. Is this accurate?";
  }
}

function isLikelyVenting(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.length > 180 ||
    /my ex|shut down|emotionally unavailable|frustrating|exhausting|hurt|angry|lonely/.test(lower)
  );
}

function relationshipReflect(text: string): string {
  const lower = text.toLowerCase();
  if (/frustrat|exhaust|drain|tired/.test(lower)) return "That sounds exhausting.";
  if (/hurt|pain|lonely|unseen/.test(lower)) return "That sounds really hard.";
  if (/angry|mad|furious/.test(lower)) return "That sounds frustrating.";
  return "That makes sense.";
}

function isLowSignalAck(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  const wordCount = normalized.split(/\s+/).length;
  if (wordCount > 5) return false;
  return LOW_SIGNAL_ACK_PATTERNS.some((pattern) => pattern.test(normalized));
}

function inferSpeakerScope(text: string): ExtractionSpeakerScope {
  const lower = text.toLowerCase();
  if (/\b(my ex|ex|they|he|she|partner)\b/.test(lower)) return "partner";
  if (/\b(i|i'm|im|me|my)\b/.test(lower)) return "self";
  return "other";
}

function inferTimeframe(text: string): ExtractionTimeframe {
  const lower = text.toLowerCase();
  if (/\b(want|need|next|looking for|this time|going forward)\b/.test(lower)) return "desired";
  if (/\b(used to|last relationship|my ex|before|in the past|previously)\b/.test(lower)) return "past";
  return "current";
}

function isForcedChoiceText(text: string): boolean {
  const normalized = text.toLowerCase();
  return (
    /would you say the bigger issue/.test(normalized) ||
    /which two are most natural/.test(normalized) ||
    /which feels more true/.test(normalized) ||
    /which two feel most like you/.test(normalized) ||
    /are you closer to/.test(normalized) ||
    /what matters most this time/.test(normalized) ||
    /scale:\s*1=/.test(normalized) ||
    /pick the closest option/.test(normalized)
  );
}

function recentForcedChoiceCount(state: LucySessionState, lookback = 4): number {
  const recent = state.messages
    .filter((message) => message.role === "assistant")
    .slice(-lookback);
  return recent.reduce((count, message) => (isForcedChoiceText(message.content) ? count + 1 : count), 0);
}

function buildOpenEndedDeepening(field: LucyAnswerField): string {
  switch (field) {
    case "past_attribution":
      return "What did that look like day-to-day for you?";
    case "conflict_speed":
      return "When tension starts, what do you usually do first in that moment?";
    case "support_need":
      return "When you're overwhelmed, what response from a partner makes you feel most supported?";
    case "emotional_openness":
      return "What makes it easier for you to open up with someone?";
    case "love_expression":
      return "What are the ways you naturally show care when you really like someone?";
    case "relationship_vision":
      return "When you picture a healthy relationship, what does an ordinary week look like?";
    case "relational_strengths":
      return "What do you think you consistently bring that's stabilizing in relationships?";
    case "growth_intention":
      return "If this next chapter goes better, what feels different for you emotionally?";
    default:
      return "Tell me more so I can match this well.";
  }
}

function isSelfReferenced(text: string): boolean {
  const sanitized = text.replace(/\bmy ex\b/gi, "");
  return /\b(i|i'm|im|me|my|mine)\b/i.test(sanitized);
}

function hasGroundingForField(field: LucyAnswerField, rawText: string, rawEvidence: string): boolean {
  const text = `${rawText} ${rawEvidence}`.toLowerCase();
  const selfReferenced = isSelfReferenced(text);
  switch (field) {
    case "past_attribution":
      return /communication|disconnect|distance|goals|timeline|intention|commitment|autonomy|external|timing|flaky|ghosted|situationship|hook ?ups|no labels|silent treatment|shut down|go silent|felt unseen/.test(text);
    case "conflict_speed":
      return (
        selfReferenced &&
        /conflict|fight|argument|resolve|right away|immediately|talk (it )?through|talk soon|soon after|cool off|cool down|quickly|space first|shut down|silent treatment|days/.test(
          text
        )
      );
    case "support_need":
      return /when (i'?m|im)? ?stressed|overwhelmed|need|helps|being heard|listen|validation|reassurance|practical|presence|space|distraction|support/.test(
        text
      );
    case "emotional_openness":
      return /open up|vulnerable|share feelings|private|guarded|selective|trust|feel safe|emotionally open|openness|mixed openness|\bopen\b/.test(
        text
      );
    case "love_expression":
      return /acts|quality time|words|physical|gifts|love language|show love/.test(text);
    case "relationship_vision":
      return /independent|best.?friend|safe|stability|adventure|intertwined|partnership/.test(text);
    case "relational_strengths":
      return /consistency|loyalty|honesty|joy|support|show up/.test(text);
    case "growth_intention":
      return /this time|next relationship|want|need|depth|balance|chosen|peace|alignment|different/.test(text);
    default:
      return true;
  }
}

function reweightUngroundedCandidate(
  state: LucySessionState,
  candidate: Candidate,
  userMessage: string
): Candidate {
  const behavioralField =
    candidate.field === "conflict_speed" ||
    candidate.field === "support_need" ||
    candidate.field === "emotional_openness";
  if (behavioralField && candidate.speakerScope === "partner") {
    return {
      ...candidate,
      confidence: Math.min(candidate.confidence, 55),
      reason: `${candidate.reason}:partner_scope_guard`
    };
  }
  if (candidate.field === "past_attribution" && candidate.timeframe === "desired") {
    return {
      ...candidate,
      confidence: Math.min(candidate.confidence, 62),
      reason: `${candidate.reason}:timeframe_guard`
    };
  }

  // Explicit quick-pick selections are grounded by turn context.
  if (candidate.source === "quick_mode") return candidate;
  // Stage-matched extractor results for the active field are grounded by structure.
  const isStructuredStageMatch = /_stage_match$/.test(candidate.reason);
  if (candidate.source === "chat" && state.current_stage === FIELD_TO_STAGE[candidate.field] && isStructuredStageMatch) {
    return candidate;
  }

  const grounded = hasGroundingForField(candidate.field, userMessage, candidate.reason);
  if (grounded) return candidate;

  let cap = 65;
  if (candidate.field === "conflict_speed" || candidate.field === "support_need" || candidate.field === "emotional_openness") {
    cap = 59;
  }

  return {
    ...candidate,
    confidence: Math.min(candidate.confidence, cap),
    reason: `${candidate.reason}:ungrounded_reweighted`
  };
}

function detectImplicationCandidates(rawInput: string): Candidate[] {
  const text = rawInput.toLowerCase();
  const candidates: Candidate[] = [];
  const evidence = rawInput.slice(0, 220);
  const speakerScope = inferSpeakerScope(rawInput);
  const timeframe = inferTimeframe(rawInput);

  function pushCandidate(candidate: Omit<Candidate, "evidenceSpans" | "speakerScope" | "timeframe"> & {
    speakerScope?: ExtractionSpeakerScope;
    timeframe?: ExtractionTimeframe;
  }) {
    candidates.push({
      ...candidate,
      evidenceSpans: [evidence],
      speakerScope: candidate.speakerScope ?? speakerScope,
      timeframe: candidate.timeframe ?? timeframe
    });
  }

  if (/emotionally unavailable|never wanted to talk about feelings|felt unseen|shut down emotionally/.test(text)) {
    pushCandidate({ field: "past_attribution", value: "emotional_disconnect", confidence: 88, source: "inferred", reason: "emotional_disconnect_pattern", timeframe: "past" });
    pushCandidate({ field: "growth_intention", value: "depth", confidence: 70, source: "inferred", reason: "depth_need_pattern", timeframe: "desired" });
  }
  if (/disappear whenever|disappeared whenever|asking for too much emotional depth|too much emotional depth/.test(text)) {
    pushCandidate({ field: "past_attribution", value: "emotional_disconnect", confidence: 90, source: "inferred", reason: "emotional_absence_pattern", timeframe: "past" });
    pushCandidate({ field: "growth_intention", value: "depth", confidence: 74, source: "inferred", reason: "depth_need_pattern", timeframe: "desired" });
  }
  if (/i get anxious|overthink|need reassurance/.test(text)) {
    pushCandidate({ field: "past_attribution", value: "emotional_disconnect", confidence: 74, source: "inferred", reason: "anxious_reassurance_pattern", timeframe: "past" });
  }
  if (/different timelines|different goals|wanted different things/.test(text)) {
    pushCandidate({ field: "past_attribution", value: "misaligned_goals", confidence: 90, source: "inferred", reason: "goal_mismatch_pattern", timeframe: "past" });
    pushCandidate({ field: "growth_intention", value: "alignment", confidence: 66, source: "inferred", reason: "alignment_need_pattern", timeframe: "desired" });
  }
  if (/hook ups|hookups|casual only|situationship|situationships|no commitment|not serious/.test(text)) {
    pushCandidate({ field: "past_attribution", value: "misaligned_goals", confidence: 86, source: "inferred", reason: "casual_mismatch_pattern", timeframe: "past" });
    pushCandidate({ field: "growth_intention", value: "alignment", confidence: 64, source: "inferred", reason: "commitment_alignment_pattern", timeframe: "desired" });
  }
  if (/go silent for days|silent treatment|disappear after fights/.test(text)) {
    pushCandidate({ field: "past_attribution", value: "conflict_comm", confidence: 92, source: "inferred", reason: "conflict_shutdown_pattern", timeframe: "past" });
    pushCandidate({ field: "conflict_speed", value: 1, confidence: 58, source: "inferred", reason: "user_prefers_repair", speakerScope, timeframe: "current" });
  }
  if (/need reassurance|need to feel chosen|chosen consistently/.test(text)) {
    pushCandidate({ field: "growth_intention", value: "chosen", confidence: 88, source: "inferred", reason: "chosen_need_pattern", timeframe: "desired" });
  }
  if (/want less conflict|want peace|no more chaos|calm/.test(text)) {
    pushCandidate({ field: "growth_intention", value: "peace", confidence: 84, source: "inferred", reason: "peace_need_pattern", timeframe: "desired" });
  }
  if (/need my space|need space first|i need distance/.test(text)) {
    pushCandidate({ field: "support_need", value: "space", confidence: 84, source: "inferred", reason: "space_support_pattern", speakerScope: "self" });
    pushCandidate({ field: "emotional_openness", value: 4, confidence: 62, source: "inferred", reason: "private_tendency_pattern", speakerScope: "self" });
  }
  if (/i need to talk things through|can't let it sit|resolve right away/.test(text)) {
    pushCandidate({ field: "conflict_speed", value: 1, confidence: 86, source: "inferred", reason: "immediate_resolution_pattern", speakerScope: "self" });
  }
  if (/just listen|need to be heard|feel heard/.test(text)) {
    pushCandidate({ field: "support_need", value: "validation", confidence: 90, source: "inferred", reason: "validation_need_pattern", speakerScope: "self" });
  }
  if (/best friend energy|best-friend/.test(text)) {
    pushCandidate({ field: "relationship_vision", value: "friendship", confidence: 90, source: "inferred", reason: "friendship_vision_pattern", timeframe: "desired" });
  }
  if (/independent but committed|need independence/.test(text)) {
    pushCandidate({ field: "relationship_vision", value: "independent", confidence: 88, source: "inferred", reason: "independent_vision_pattern", timeframe: "desired" });
  }

  return candidates;
}

function extractCandidates(rawInput: string, state: LucySessionState): Candidate[] {
  const candidates: Candidate[] = [];
  const quickTargetField = state.quick_mode ? missingFields(state, 70)[0] : null;
  const normalizedInput = rawInput.trim().toLowerCase();
  const bareNumericSelection = /^[1-5]$/.test(normalizedInput);
  const activeField = REQUIRED_STAGE_FIELDS[state.current_stage];
  const pendingField = state.control_flags.pending_confirmation_field;

  for (const [stage, field] of Object.entries(REQUIRED_STAGE_FIELDS) as Array<[LucyStageId, LucyAnswerField | null]>) {
    if (!field || stage === "opening" || stage === "closing") continue;
    if (quickTargetField && quickTargetField !== field) continue;
    if (
      bareNumericSelection &&
      field !== activeField &&
      field !== pendingField &&
      field !== quickTargetField
    ) {
      continue;
    }
    const result = extractForStage(stage, rawInput);
    if (result.matched) {
      const adjusted = Math.max(0, Math.min(100, result.confidence - (result.ambiguous ? 10 : 0)));
      candidates.push({
        field,
        value: result.value,
        confidence: adjusted,
        source: state.quick_mode ? "quick_mode" : "chat",
        reason: `${stage}_stage_match`,
        evidenceSpans: [rawInput.slice(0, 220)],
        speakerScope: inferSpeakerScope(rawInput),
        timeframe: inferTimeframe(rawInput)
      });
    }
  }

  candidates.push(...detectImplicationCandidates(rawInput));

  const dedup = new Map<LucyAnswerField, Candidate>();
  for (const candidate of candidates) {
    const existing = dedup.get(candidate.field);
    if (!existing || existing.confidence < candidate.confidence) {
      dedup.set(candidate.field, candidate);
    }
  }
  return [...dedup.values()].sort((a, b) => b.confidence - a.confidence);
}

function candidateValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => String(value) === String(right[index]));
  }
  return String(left) === String(right);
}

function applyCandidates(state: LucySessionState, candidates: Candidate[]): {
  state: LucySessionState;
  mediumCandidate: Candidate | null;
  resolvedFields: LucyAnswerField[];
} {
  let next = state;
  let mediumCandidate: Candidate | null = null;
  const resolvedFields: LucyAnswerField[] = [];

  for (const candidate of candidates) {
    const activeField = REQUIRED_STAGE_FIELDS[next.current_stage];
    const current = next.extraction_envelopes[candidate.field];
    const currentConfidence = current?.confidence ?? 0;
    const valueChanged = !candidateValuesEqual(current?.value, candidate.value);
    const stageMatchCorrection =
      (candidate.field === "conflict_speed" || candidate.field === "emotional_openness") &&
      /_stage_match$/.test(candidate.reason) &&
      candidate.source !== "inferred" &&
      valueChanged;
    const directCorrection =
      activeField === candidate.field &&
      candidate.source !== "inferred" &&
      valueChanged;
    if (!directCorrection && !stageMatchCorrection) {
      if (candidate.confidence < currentConfidence) continue;
      if (candidate.confidence === currentConfidence) {
        if (!valueChanged) continue;
        if (candidate.source === "inferred") continue;
      }
    } else if (candidate.confidence + 12 < currentConfidence) {
      continue;
    }

    // Direct responses to the actively discussed field should commit without extra confirmation churn.
    if (
      activeField === candidate.field &&
      candidate.source !== "inferred" &&
      candidate.confidence >= 70
    ) {
      const commitConfidence = Math.max(80, candidate.confidence);
      next = upsertField(next, candidate.field, candidate.value, commitConfidence, candidate.source, false, {
        evidenceSpans: candidate.evidenceSpans,
        speakerScope: candidate.speakerScope,
        timeframe: candidate.timeframe
      });
      resolvedFields.push(candidate.field);
      continue;
    }

    if (candidate.confidence >= 80) {
      next = upsertField(next, candidate.field, candidate.value, candidate.confidence, candidate.source, false, {
        evidenceSpans: candidate.evidenceSpans,
        speakerScope: candidate.speakerScope,
        timeframe: candidate.timeframe
      });
      resolvedFields.push(candidate.field);
      continue;
    }

    if (candidate.confidence >= 60) {
      next = upsertField(next, candidate.field, candidate.value, candidate.confidence, candidate.source, true, {
        evidenceSpans: candidate.evidenceSpans,
        speakerScope: candidate.speakerScope,
        timeframe: candidate.timeframe
      });
      resolvedFields.push(candidate.field);
      if (!mediumCandidate) {
        mediumCandidate = candidate;
      }
    }
  }

  return { state: updateCurrentStageFromCoverage(next), mediumCandidate, resolvedFields };
}

function countUserTurns(state: LucySessionState): number {
  return state.messages.filter((message) => message.role === "user").length;
}

function lastAssistantContent(state: LucySessionState): string | null {
  for (let index = state.messages.length - 1; index >= 0; index -= 1) {
    const message = state.messages[index];
    if (message?.role === "assistant") {
      return message.content;
    }
  }
  return null;
}

function setUnresolvedAttempt(
  state: LucySessionState,
  field: LucyAnswerField,
  count: number
): LucySessionState {
  return {
    ...state,
    control_flags: {
      ...state.control_flags,
      unresolved_attempts: {
        ...(state.control_flags.unresolved_attempts ?? {}),
        [field]: count
      }
    }
  };
}

function resetUnresolvedAttempt(state: LucySessionState, field: LucyAnswerField): LucySessionState {
  const attempts = { ...(state.control_flags.unresolved_attempts ?? {}) };
  delete attempts[field];
  return {
    ...state,
    control_flags: {
      ...state.control_flags,
      unresolved_attempts: attempts
    }
  };
}

function clearExtractedField(state: LucySessionState, field: LucyAnswerField): LucySessionState {
  const stage = FIELD_TO_STAGE[field];
  const extracted = { ...state.extracted_data };
  const envelopes = { ...state.extraction_envelopes };
  const timeframeTags = { ...(state.control_flags.field_timeframe_tags ?? {}) };
  delete extracted[field];
  delete envelopes[field];
  delete timeframeTags[field];
  return {
    ...state,
    current_stage: stage,
    extracted_data: extracted,
    extraction_envelopes: envelopes,
    stage_states: {
      ...state.stage_states,
      [stage]: {
        ...state.stage_states[stage],
        status: "active",
        completed_at: null,
        requires_confirmation: false,
        confidence: Math.min(state.stage_states[stage].confidence, 60)
      }
    },
    control_flags: {
      ...state.control_flags,
      field_timeframe_tags: timeframeTags
    }
  };
}

function clearPendingConfirmation(state: LucySessionState): LucySessionState {
  return {
    ...state,
    control_flags: {
      ...state.control_flags,
      pending_confirmation_field: undefined,
      pending_confirmation_value: undefined,
      pending_confirmation_confidence: undefined,
      pending_confirmation_question: undefined,
      pending_confirmation_attempts: 0,
      pending_confirmation_explained: false,
      user_confusion_turn: false
    }
  };
}

function pendingConfirmationAttempts(state: LucySessionState): number {
  return Math.max(0, state.control_flags.pending_confirmation_attempts ?? 0);
}

function withConfirmationLoopCount(state: LucySessionState): LucySessionState {
  return {
    ...state,
    control_flags: {
      ...state.control_flags,
      confirmation_loop_count: (state.control_flags.confirmation_loop_count ?? 0) + 1
    }
  };
}

function buildContrastQuestion(field: LucyAnswerField): string {
  switch (field) {
    case "past_attribution":
      return "If you had to pick one, was it mostly mixed intentions, communication breakdown, emotional distance, autonomy, or outside timing?";
    case "conflict_speed":
      return "Are you closer to talk-now, cool-off then talk, or space-first?";
    case "support_need":
      return "When stress is high, is it more listening first, practical help, closeness, space, or distraction?";
    case "emotional_openness":
      return "Are you mostly open once trust is there, or mostly private with feelings?";
    case "love_expression":
      return "Which two feel most natural for you: acts, time, words, physical closeness, or gifts?";
    case "relationship_vision":
      return "Which feels closest for you right now: independent partnership, best-friend foundation, safe stability, or shared adventure?";
    case "relational_strengths":
      return "Which two feel most like you: consistency, loyalty, honesty, joy, or support?";
    case "growth_intention":
      return "What is the one change you care about most now: depth, balance, chosen, peace, or alignment?";
    default:
      return "Let me ask this a different way.";
  }
}

function withAntiLoopGuard(
  state: LucySessionState,
  nextMessage: string,
  fallbackMessage: string
): { state: LucySessionState; content: string; triggered: boolean } {
  const previous = lastAssistantContent(state);
  if (!previous) {
    return { state, content: nextMessage, triggered: false };
  }
  if (previous.trim().toLowerCase() !== nextMessage.trim().toLowerCase()) {
    return { state, content: nextMessage, triggered: false };
  }
  const guarded = {
    ...state,
    control_flags: {
      ...state.control_flags,
      repeat_prompt_guard_hits: (state.control_flags.repeat_prompt_guard_hits ?? 0) + 1
    }
  };
  return { state: guarded, content: fallbackMessage, triggered: true };
}

function pendingClarificationOptions(field: LucyAnswerField, includeQuickPick: boolean): LucyOption[] {
  if (!includeQuickPick) return CONFIRMATION_DECISION_OPTIONS;
  const quick = QUICK_OPTIONS[field] ?? [];
  return [...CONFIRMATION_DECISION_OPTIONS, ...quick];
}

function convertSignalsToCandidates(signals: LucyTurnUnderstandingSignal[], state: LucySessionState): Candidate[] {
  const dedup = new Map<LucyAnswerField, Candidate>();
  for (const signal of signals) {
    const mappedSource: Candidate["source"] =
      signal.source === "llm" ? (state.quick_mode ? "quick_mode" : "chat") : "inferred";
    const candidate: Candidate = {
      field: signal.field,
      value: signal.value,
      confidence: signal.confidence,
      source: mappedSource,
      reason: signal.evidence,
      evidenceSpans: signal.evidence_spans?.slice(0, 3) ?? [signal.evidence],
      speakerScope: signal.speaker_scope,
      timeframe: signal.timeframe
    };
    const current = dedup.get(candidate.field);
    if (!current || current.confidence < candidate.confidence) {
      dedup.set(candidate.field, candidate);
    }
  }
  return [...dedup.values()].sort((a, b) => b.confidence - a.confidence);
}

async function finalizeAssistantMessage(
  state: LucySessionState,
  draft: string,
  intent: string,
  uncoveredFields: LucyAnswerField[]
): Promise<string> {
  const mode = (process.env.LUCY_UNDERSTANDING_MODE ?? "llm_first_v1").trim();
  if (mode === "llm_first_v1") {
    return draft;
  }
  const llmText = await maybeGenerateLucyAssistantMessage({
    messages: state.messages,
    draft,
    intent,
    uncoveredFields
  });
  return llmText ?? draft;
}

export async function processLucyUserMessageConversational(
  state: LucySessionState,
  rawInput: string,
  userMessageId?: string
): Promise<LucySessionState> {
  const messageText = rawInput.trim();
  if (!messageText) {
    return addAssistantMessage(state, "Take your time. A short answer is fine.");
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
    last_user_message_id: userMessageId ?? null,
    control_flags: {
      ...next.control_flags,
      challenge_detected_turn: false,
      dispute_resolved_turn: false,
      stage_jump_after_dispute_turn: false,
      explanation_requested_turn: false,
      topic_switch_detected_turn: false
    }
  };

  if (next.current_stage === "opening") {
    next = markOpeningComplete(next);
    next = {
      ...next,
      control_flags: {
        ...next.control_flags,
        conversation_mode: "rapport"
      }
    };
    if (/quick/i.test(messageText)) {
      const quickState: LucySessionState = {
        ...next,
        quick_mode: true,
        control_flags: {
          ...next.control_flags,
          used_quick_mode: true,
          conversation_mode: "gap_fill"
        }
      };
      const draft = "No problem, we can do quick picks. Start with this: what felt like the core issue in your last relationship?";
      const content = await finalizeAssistantMessage(quickState, draft, "gap_fill", missingFields(quickState));
      return addAssistantMessage(quickState, content, "normal");
    }

    if (/trust|safe|private|privacy|data|real|bot|human/i.test(messageText)) {
      const draft = "Fair question. I use this to improve your match fit, and you can change anything before we lock it. What’s your dating situation right now?";
      const content = await finalizeAssistantMessage(next, draft, "validate_reflect", missingFields(next));
      return addAssistantMessage(next, content, "normal");
    }
  }

  const safety = detectSafetyType(messageText);
  if (safety) {
    const safetyText =
      safety === "self_harm"
        ? "I’m really glad you said that. I can’t support crises directly here, so please contact local emergency services or a crisis line right now."
        : safety === "threat"
          ? "I can’t help with harming anyone. If there’s immediate danger, contact local emergency services now."
          : "I can’t continue with hateful language. If you want to continue, we can keep this respectful and focused.";

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

  if (isExternalCapabilityRequest(messageText)) {
    const lead = missingFields(next, 70)[0];
    const draft = lead
      ? `I can’t perform external actions from here, but I can help you narrow this down. ${buildDirectQuestion(lead)}`
      : "I can’t perform external actions from here, but I can keep helping with your dating profile.";
    const content = await finalizeAssistantMessage(next, draft, "redirect", missingFields(next, 70));
    return addAssistantMessage(next, content, "redirect");
  }

  const category = detectOffTopicCategory(messageText);
  if (category && category !== "venting") {
    const policy = buildRedirectPolicy(next.off_topic_total + 1, next.off_topic_consecutive + 1, category);
    const redirected = {
      ...next,
      off_topic_total: next.off_topic_total + 1,
      off_topic_consecutive: next.off_topic_consecutive + 1,
      quick_mode: policy.response_tier === "escape_hatch" ? true : next.quick_mode,
      control_flags: {
        ...next.control_flags,
        used_quick_mode: policy.response_tier === "escape_hatch" ? true : next.control_flags.used_quick_mode
      }
    };
    const draft = getRedirectResponse(policy);
    const fallback =
      policy.response_tier === "firm"
        ? "I want this to help you. Give me this one answer, then we’ll keep moving."
        : policy.response_tier === "medium"
          ? "Quick one from me first so I can keep this useful."
          : "I’ll keep this short. One quick answer from you first.";
    const guarded = withAntiLoopGuard(redirected, draft, fallback);
    const content = await finalizeAssistantMessage(guarded.state, guarded.content, "redirect", missingFields(guarded.state));
    return addAssistantMessage(guarded.state, content, "redirect");
  }

  next = {
    ...next,
    off_topic_consecutive: 0
  };

  if (next.control_flags.pending_confirmation_field) {
    const pendingField = next.control_flags.pending_confirmation_field;
    const stillMissing = missingFields(next, 75).includes(pendingField);
    if (!stillMissing) {
      next = clearPendingConfirmation({
        ...next,
        control_flags: {
          ...next.control_flags,
          stale_pending_reset_count: (next.control_flags.stale_pending_reset_count ?? 0) + 1
        }
      });
    }
  }

  if (next.control_flags.pending_confirmation_field) {
    const field = next.control_flags.pending_confirmation_field;
    const pendingValue = next.control_flags.pending_confirmation_value;
    const pendingConfidence = next.control_flags.pending_confirmation_confidence ?? 70;
    const nextAttempt = pendingConfirmationAttempts(next) + 1;
    const askedClarification = isClarificationQuestion(messageText) || isMetaQuestionAboutTerm(messageText);
    const interpretationChallenge = isInterpretationChallenge(messageText);
    const uncertainAnswer = isUncertainAnswer(messageText);
    const isNegativeOrEdit = /\bno\b|\bnot really\b|\bchange\b|\bedit\b|\bupdate\b/i.test(messageText);
    const pendingStage = FIELD_TO_STAGE[field];
    const directPendingExtraction = extractForStage(pendingStage, messageText);

    // If user gives a concrete answer for the pending field, accept it directly instead of looping on yes/no.
    if (!askedClarification && !interpretationChallenge && directPendingExtraction.matched && directPendingExtraction.value !== undefined) {
      const normalizedDirect = String(directPendingExtraction.value).trim().toLowerCase();
      const normalizedPending = String(pendingValue ?? "").trim().toLowerCase();
      const commitState = upsertField(
        clearPendingConfirmation(next),
        field,
        directPendingExtraction.value,
        Math.max(80, directPendingExtraction.confidence),
        next.quick_mode ? "quick_mode" : "chat",
        false,
        {
          evidenceSpans: [messageText.slice(0, 220)],
          speakerScope: inferSpeakerScope(messageText),
          timeframe: inferTimeframe(messageText)
        }
      );
      next = updateCurrentStageFromCoverage(resetUnresolvedAttempt(commitState, field));
      const draft =
        normalizedDirect === normalizedPending
          ? "Perfect, that helps. Let’s keep going."
          : "Got it, I’ll update that and keep going.";
      const content = await finalizeAssistantMessage(next, draft, "validate_reflect", missingFields(next));
      return addAssistantMessage(next, content, "normal");
    }

    // If user clearly answered a different core field, clear stale pending and continue normal extraction flow.
    const strongOtherSignalField =
      !askedClarification &&
      !uncertainAnswer &&
      (
        Object.entries(REQUIRED_STAGE_FIELDS) as Array<[LucyStageId, LucyAnswerField | null]>
      ).find(([stageId, mappedField]) => {
        if (!mappedField || mappedField === field || stageId === "opening" || stageId === "closing") return false;
        const parsed = extractForStage(stageId, messageText);
        return parsed.matched && parsed.confidence >= 75;
      })?.[1];
    if (strongOtherSignalField) {
      next = clearPendingConfirmation({
        ...next,
        control_flags: {
          ...next.control_flags,
          stale_pending_reset_count: (next.control_flags.stale_pending_reset_count ?? 0) + 1,
          topic_switch_detected_turn: true,
          topic_thread_id: strongOtherSignalField
        }
      });
    }

    if (!next.control_flags.pending_confirmation_field) {
      // Pending state was cleared because user moved the conversation forward. Continue with normal pipeline.
    } else if (isAffirmative(messageText) || matchesPendingValue(field, pendingValue, messageText)) {
      const confirmed = upsertField(
        clearPendingConfirmation(next),
        field,
        pendingValue,
        Math.max(80, pendingConfidence),
        "inferred",
        false,
        {
          evidenceSpans: [messageText.slice(0, 220)],
          speakerScope: inferSpeakerScope(messageText),
          timeframe: inferTimeframe(messageText)
        }
      );
      next = updateCurrentStageFromCoverage(resetUnresolvedAttempt(confirmed, field));
      const draft = "Perfect, that helps. Let’s keep going.";
      const content = await finalizeAssistantMessage(next, draft, "validate_reflect", missingFields(next));
      return addAssistantMessage(next, content, "normal");
    } else if (isNegativeOrEdit) {
      const cleared = clearPendingConfirmation(next);
      const draft = `Got it, let’s correct that. ${buildDirectQuestion(field)}`;
      const content = await finalizeAssistantMessage(cleared, draft, "direct_gap_fill", missingFields(cleared));
      return addAssistantMessage(cleared, content, "clarification", QUICK_OPTIONS[field] ?? []);
    } else if (interpretationChallenge) {
      const disputedFields = new Set(next.control_flags.disputed_fields ?? []);
      disputedFields.add(field);
      const corrected = resetUnresolvedAttempt(
        clearExtractedField(
          clearPendingConfirmation(
            withConfirmationLoopCount({
              ...next,
              control_flags: {
                ...next.control_flags,
                challenge_detected_turn: true,
                dispute_resolved_turn: true,
                disputed_fields: [...disputedFields],
                last_disputed_field: field,
                topic_thread_id: field
              }
            })
          ),
          field
        ),
        field
      );
      const draft = `You’re right, that was my assumption. ${buildDirectQuestion(field)}`;
      const guarded = withAntiLoopGuard(corrected, draft, `You're right. ${buildDirectQuestion(field)}`);
      const content = await finalizeAssistantMessage(guarded.state, guarded.content, "clarify_interpretation", missingFields(guarded.state));
      return addAssistantMessage(guarded.state, content, "clarification");
    }
    if (!next.control_flags.pending_confirmation_field) {
      // continue to normal understanding path
    } else {

      const pendingState: LucySessionState = {
        ...next,
        control_flags: {
          ...next.control_flags,
          pending_confirmation_attempts: nextAttempt,
          user_confusion_turn: askedClarification || uncertainAnswer,
          explanation_requested_turn: askedClarification || next.control_flags.explanation_requested_turn
        }
      };

      if (askedClarification && !pendingState.control_flags.pending_confirmation_explained) {
        const rendered = renderConfirmationValue(field, pendingValue);
        const legend = buildScaleLegend(field);
        const explanation = legend
          ? `Good question. I mean ${rendered}. ${legend} Does that fit you?`
          : `Good question. I interpreted it as ${rendered}. Does that fit, or should I change it?`;
        const guarded = withAntiLoopGuard(
          withConfirmationLoopCount(pendingState),
          explanation,
          `Quick check: ${buildConfirmationQuestion(field, pendingValue)}`
        );
        const explainedState: LucySessionState = {
          ...guarded.state,
          control_flags: {
            ...guarded.state.control_flags,
            pending_confirmation_explained: true,
            explanation_requested_turn: true
          }
        };
        const content = await finalizeAssistantMessage(explainedState, guarded.content, "clarify_interpretation", missingFields(explainedState));
        return addAssistantMessage(
          explainedState,
          content,
          "clarification",
          pendingClarificationOptions(field, true)
        );
      }

      if (nextAttempt >= 4) {
        const released = clearPendingConfirmation(withConfirmationLoopCount(pendingState));
        const unresolved = missingFields(released, 70);
        const lead = unresolved[0];
        const draft = lead
          ? `No worries. I’ll keep that tentative for now. ${buildDirectQuestion(lead)}`
          : "No worries. I’ll keep that tentative and continue.";
        const guarded = withAntiLoopGuard(released, draft, "No worries, we can keep moving.");
        const content = await finalizeAssistantMessage(guarded.state, guarded.content, "pivot_to_missing_dimension", unresolved);
        return addAssistantMessage(guarded.state, content, "normal");
      }

      if (nextAttempt >= 3 || uncertainAnswer) {
        const directPick = "No problem. Choose the closest option so I can keep this accurate.";
        const guarded = withAntiLoopGuard(withConfirmationLoopCount(pendingState), directPick, `Let's pick this directly.`);
        const content = await finalizeAssistantMessage(guarded.state, guarded.content, "clarify_interpretation", missingFields(guarded.state));
        return addAssistantMessage(guarded.state, content, "clarification", QUICK_OPTIONS[field] ?? []);
      }

      const repeat = next.control_flags.pending_confirmation_question ?? "Quick check: is that accurate?";
      const guarded = withAntiLoopGuard(withConfirmationLoopCount(pendingState), repeat, `Quick check: ${buildConfirmationQuestion(field, pendingValue)}`);
      const content = await finalizeAssistantMessage(guarded.state, guarded.content, "clarify_interpretation", missingFields(guarded.state));
      return addAssistantMessage(guarded.state, content, "clarification", pendingClarificationOptions(field, false));
    }
  }

  if (next.control_flags.pending_contradiction_prompt) {
    next = {
      ...next,
      control_flags: {
        ...next.control_flags,
        pending_contradiction_prompt: undefined
      }
    };
  }

  if (isInterpretationChallenge(messageText)) {
    next = {
      ...next,
      control_flags: {
        ...next.control_flags,
        challenge_detected_turn: true
      }
    };
  }

  const unresolvedBefore = missingFields(next, 70);
  const stageBeforeUnderstanding = next.current_stage;
  const understandingOutcome = await understandTurn({
    state: next,
    userMessage: messageText,
    missingFields: unresolvedBefore
  });
  next = {
    ...next,
    control_flags: {
      ...next.control_flags,
      understanding_mode: understandingOutcome.source === "llm" ? "llm_first_v1" : "rules_fallback",
      last_understanding_source: understandingOutcome.source,
      fallback_reason: understandingOutcome.fallback_reason,
      schema_validation_failed: understandingOutcome.schema_validation_failed,
      last_llm_latency_ms: understandingOutcome.llm_latency_ms,
      provider_used_last_turn: understandingOutcome.provider_used,
      user_confusion_turn: false
    }
  };

  let candidates = convertSignalsToCandidates(understandingOutcome.understanding.signals, next);
  const ruleCandidates = extractCandidates(messageText, next);
  if (ruleCandidates.length > 0) {
    const merged = new Map<LucyAnswerField, Candidate>();
    const activeFieldForMerge = REQUIRED_STAGE_FIELDS[next.current_stage];
    for (const candidate of [...candidates, ...ruleCandidates]) {
      const existing = merged.get(candidate.field);
      if (!existing) {
        merged.set(candidate.field, candidate);
        continue;
      }

      const candidateStageMatch = /_stage_match$/.test(candidate.reason);
      const existingStageMatch = /_stage_match$/.test(existing.reason);
      if (
        candidate.field === activeFieldForMerge &&
        candidateStageMatch &&
        (!existingStageMatch || candidate.confidence >= existing.confidence - 15)
      ) {
        merged.set(candidate.field, candidate);
        continue;
      }
      if (
        existing.field === activeFieldForMerge &&
        existingStageMatch &&
        !candidateStageMatch &&
        existing.confidence >= candidate.confidence - 15
      ) {
        continue;
      }

      const existingPreferred = existing.source !== "inferred";
      const candidatePreferred = candidate.source !== "inferred";
      if (candidatePreferred && !existingPreferred && candidate.confidence >= existing.confidence - 15) {
        merged.set(candidate.field, candidate);
        continue;
      }
      if (!candidatePreferred && existingPreferred && existing.confidence >= candidate.confidence - 15) {
        continue;
      }
      if (
        existing.confidence < candidate.confidence ||
        (existing.confidence === candidate.confidence &&
          existing.source === "inferred" &&
          candidate.source !== "inferred")
      ) {
        merged.set(candidate.field, candidate);
      }
    }
    candidates = [...merged.values()].sort((a, b) => b.confidence - a.confidence);
  }

  candidates = candidates
    .map((candidate) => reweightUngroundedCandidate(next, candidate, messageText))
    .sort((a, b) => b.confidence - a.confidence);

  const applied = applyCandidates(next, candidates);
  next = applied.state;
  const stageAfterUnderstanding = next.current_stage;
  if (stageAfterUnderstanding !== stageBeforeUnderstanding) {
    const previousStageField = REQUIRED_STAGE_FIELDS[stageBeforeUnderstanding];
    const resolvedPreviousStageField = previousStageField
      ? applied.resolvedFields.includes(previousStageField)
      : false;
    if (!resolvedPreviousStageField) {
      next = {
        ...next,
        control_flags: {
          ...next.control_flags,
          topic_switch_detected_turn: true,
          topic_thread_id: stageAfterUnderstanding
        }
      };
    }
  }
  for (const field of applied.resolvedFields) {
    next = resetUnresolvedAttempt(next, field);
    if (next.control_flags.last_disputed_field === field) {
      next = {
        ...next,
        control_flags: {
          ...next.control_flags,
          last_disputed_field: undefined
        }
      };
    }
  }

  const contradiction = contradictionPrompt(next.extracted_data);
  const promptedContradictions = new Set(next.control_flags.contradiction_prompted_keys ?? []);
  if (contradiction && !promptedContradictions.has(contradiction.key)) {
    promptedContradictions.add(contradiction.key);
    const flagged = {
      ...next,
      control_flags: {
        ...next.control_flags,
        contradiction_flag: true,
        pending_contradiction_prompt: contradiction.prompt,
        contradiction_prompted_keys: [...promptedContradictions]
      }
    };
    const content = await finalizeAssistantMessage(flagged, contradiction.prompt, "clarify_interpretation", missingFields(flagged));
    return addAssistantMessage(flagged, content, "clarification");
  }

  const mediumCandidate =
    applied.mediumCandidate ??
    (() => {
      const first = understandingOutcome.understanding.needs_confirmation[0];
      if (!first) return null;
      return {
        field: first.field,
        value: first.value,
        confidence: 70,
        source: "inferred" as const,
        reason: first.reason,
        evidenceSpans: [first.reason.slice(0, 220)],
        speakerScope: inferSpeakerScope(first.reason),
        timeframe: inferTimeframe(first.reason)
      };
    })();

  if (mediumCandidate) {
    const existing = next.extraction_envelopes[mediumCandidate.field];
    const existingConfidence = existing?.confidence ?? 0;
    if (existingConfidence < mediumCandidate.confidence) {
      next = upsertField(
        next,
        mediumCandidate.field,
        mediumCandidate.value,
        mediumCandidate.confidence,
        mediumCandidate.source,
        true,
        {
          evidenceSpans: mediumCandidate.evidenceSpans,
          speakerScope: mediumCandidate.speakerScope,
          timeframe: mediumCandidate.timeframe
        }
      );
    }
  }

  const unresolvedBeforeConfirm = missingFields(next, 75);
  const disputedField = next.control_flags.last_disputed_field;
  const disputedStillOpen = Boolean(disputedField && unresolvedBeforeConfirm.includes(disputedField));
  const leadMissingField = disputedStillOpen ? disputedField : unresolvedBeforeConfirm[0];

  if (mediumCandidate && leadMissingField && mediumCandidate.field !== leadMissingField) {
    next = {
      ...next,
      control_flags: {
        ...next.control_flags,
        lead_field_jump_count: (next.control_flags.lead_field_jump_count ?? 0) + 1,
        stage_jump_after_dispute_turn:
          disputedStillOpen && disputedField ? true : next.control_flags.stage_jump_after_dispute_turn
      }
    };
  }

  if (mediumCandidate && leadMissingField === mediumCandidate.field) {
    const question = buildConfirmationQuestion(mediumCandidate.field, mediumCandidate.value);
    const waiting = {
      ...next,
      control_flags: {
        ...next.control_flags,
        pending_confirmation_field: mediumCandidate.field,
        pending_confirmation_value: mediumCandidate.value,
        pending_confirmation_confidence: mediumCandidate.confidence,
        pending_confirmation_question: question,
        pending_confirmation_attempts: 0,
        pending_confirmation_explained: false,
        user_confusion_turn: false
      }
    };
    const content = await finalizeAssistantMessage(waiting, question, "clarify_interpretation", missingFields(waiting));
    return addAssistantMessage(waiting, content, "clarification", pendingClarificationOptions(mediumCandidate.field, false));
  }

  const unresolved = missingFields(next, 70);
  const llmReply = understandingOutcome.source === "llm" ? understandingOutcome.understanding.assistant_reply.trim() : "";
  if (unresolved.length === 0) {
    if (isAffirmative(messageText)) {
      return addAssistantMessage(
        {
          ...next,
          current_stage: "closing",
          completed: true,
          control_flags: {
            ...next.control_flags,
            conversation_mode: "closing",
            synthesis_presented: true
          }
        },
        "Done. I have what I need, and I’m finding your best-fit matches now.",
        "summary"
      );
    }

    if (!next.control_flags.synthesis_presented) {
      const synthesisState: LucySessionState = {
        ...next,
        current_stage: "closing",
        control_flags: {
          ...next.control_flags,
          synthesis_presented: true,
          conversation_mode: "synthesis"
        }
      };
      const content = await finalizeAssistantMessage(synthesisState, buildSynthesis(synthesisState), "synthesize_progress", unresolved);
      return addAssistantMessage(synthesisState, content, "summary");
    }

    const draft = "Anything you want me to tweak before I lock this in?";
    const content = await finalizeAssistantMessage(next, draft, "synthesize_progress", unresolved);
    return addAssistantMessage(next, content, "summary");
  }

  const userTurns = countUserTurns(next);
  const leadField = unresolved[0];
  if (!leadField) {
    const fallback = await finalizeAssistantMessage(next, "Anything else you want to add before I lock this in?", "synthesize_progress", unresolved);
    return addAssistantMessage(next, fallback, "summary");
  }
  next = {
    ...next,
    control_flags: {
      ...next.control_flags,
      topic_thread_id: leadField
    }
  };
  const lowSignalAck = isLowSignalAck(messageText);
  const forcedChoicePressure = recentForcedChoiceCount(next, 4);

  if (lowSignalAck) {
    const openEnded = `${relationshipReflect(messageText)} ${buildOpenEndedDeepening(leadField)}`;
    const guardedAck = withAntiLoopGuard(
      next,
      openEnded,
      `Quick follow-up: ${buildOpenEndedDeepening(leadField)}`
    );
    const ackContent = await finalizeAssistantMessage(
      guardedAck.state,
      guardedAck.content,
      "validate_reflect",
      unresolved
    );
    return addAssistantMessage(
      {
        ...guardedAck.state,
        control_flags: {
          ...guardedAck.state.control_flags,
          conversation_mode: unresolved.length <= 2 ? "gap_fill" : "explore"
        }
      },
      ackContent,
      "normal"
    );
  }

  const currentAttempts = next.control_flags.unresolved_attempts?.[leadField] ?? 0;
  const attempt = currentAttempts + 1;
  next = setUnresolvedAttempt(next, leadField, attempt);
  const reflectiveLead = relationshipReflect(messageText);

  if (attempt >= 3 && forcedChoicePressure >= 2) {
    const openEnded = `${reflectiveLead} ${buildOpenEndedDeepening(leadField)}`;
    const guardedOpen = withAntiLoopGuard(next, openEnded, `Let me ask this a different way. ${buildOpenEndedDeepening(leadField)}`);
    const content = await finalizeAssistantMessage(guardedOpen.state, guardedOpen.content, "clarify_interpretation", unresolved);
    return addAssistantMessage(guardedOpen.state, content, "normal");
  }

  if (attempt >= 4) {
    const guardedQuick = withAntiLoopGuard(
      next,
      "I want to get this right. Want to choose from options for this one?",
      `Let’s choose from options for ${leadField.replace(/_/g, " ")}.`
    );
    return addAssistantMessage(
      {
        ...guardedQuick.state,
        control_flags: {
          ...guardedQuick.state.control_flags,
          conversation_mode: "gap_fill"
        }
      },
      guardedQuick.content,
      "clarification",
      QUICK_OPTIONS[leadField]
    );
  }

  if (attempt === 3) {
    const deepen = `${reflectiveLead} ${buildOpenEndedDeepening(leadField)}`;
    const guardedDeepen = withAntiLoopGuard(next, deepen, `I want to make sure I get this right. ${buildDirectQuestion(leadField)}`);
    const deepenContent = await finalizeAssistantMessage(guardedDeepen.state, guardedDeepen.content, "clarify_interpretation", unresolved);
    return addAssistantMessage(guardedDeepen.state, deepenContent, "normal");
  }

  if (attempt === 2) {
    const contrast =
      forcedChoicePressure >= 1
        ? buildOpenEndedDeepening(leadField)
        : buildContrastQuestion(leadField);
    const guardedContrast = withAntiLoopGuard(next, contrast, `Quick compare: ${buildDirectQuestion(leadField)}`);
    const contrastContent = await finalizeAssistantMessage(guardedContrast.state, guardedContrast.content, "clarify_interpretation", unresolved);
    return addAssistantMessage(guardedContrast.state, contrastContent, "clarification");
  }

  let draft = llmReply;
  if (!draft) {
    if (userTurns <= 2 && !hasValue(next, "past_attribution")) {
      draft = `${reflectiveLead} What pattern in past dating are you most done with right now?`;
    } else if (isLikelyVenting(messageText)) {
      draft = `${reflectiveLead} To help me find better fits, what did you need most in those moments?`;
    } else {
      const prompt = forcedChoicePressure >= 2 ? buildOpenEndedDeepening(leadField) : buildDirectQuestion(leadField);
      if (hasValue(next, leadField)) {
        draft = `Thanks, that helps. ${prompt}`;
      } else {
        draft = `${reflectiveLead} ${prompt}`;
      }
    }
  }
  const guardedDraft = withAntiLoopGuard(next, draft, `Let me ask that differently. ${buildContrastQuestion(leadField)}`);
  const content = await finalizeAssistantMessage(guardedDraft.state, guardedDraft.content, "pivot_to_missing_dimension", unresolved);
  return addAssistantMessage(
    {
      ...guardedDraft.state,
      control_flags: {
        ...guardedDraft.state.control_flags,
        conversation_mode: unresolved.length <= 2 ? "gap_fill" : "explore"
      }
    },
    content,
    "normal"
  );
}
