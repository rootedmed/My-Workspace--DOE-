import { z } from "zod";
import JSON5 from "json5";
import { REQUIRED_STAGE_FIELDS } from "@/lib/onboarding/lucy/config";
import { detectOffTopicCategory, detectSafetyType } from "@/lib/onboarding/lucy/detectors";
import { extractForStage } from "@/lib/onboarding/lucy/extractors";
import { LUCY_UNDERSTANDING_SYSTEM_PROMPT } from "@/lib/onboarding/lucy/systemPrompt";
import type {
  LucyAnswerField,
  LucyLlmProvider,
  LucySessionState,
  LucyStageId,
  LucyTurnUnderstanding,
  LucyTurnUnderstandingSignal
} from "@/lib/onboarding/lucy/types";

const FIELD_VALUES = {
  past_attribution: ["misaligned_goals", "conflict_comm", "emotional_disconnect", "autonomy", "external"] as const,
  conflict_speed: [1, 2, 3, 4, 5] as const,
  support_need: ["validation", "practical", "presence", "space", "distraction"] as const,
  emotional_openness: [1, 2, 3, 4, 5] as const,
  love_expression: ["acts", "time", "words", "physical", "gifts"] as const,
  relationship_vision: ["independent", "enmeshed", "friendship", "safe", "adventure"] as const,
  relational_strengths: ["consistency", "loyalty", "honesty", "joy", "support"] as const,
  growth_intention: ["depth", "balance", "chosen", "peace", "alignment"] as const
} as const;

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

const FIELD_ENUM = z.enum([
  "past_attribution",
  "conflict_speed",
  "support_need",
  "emotional_openness",
  "love_expression",
  "relationship_vision",
  "relational_strengths",
  "growth_intention"
]);

const OFF_TOPIC_ENUM = z.enum([
  "testing_lucy",
  "venting",
  "flirting",
  "advice_request",
  "meta_question",
  "hostility"
]);

const SAFETY_ENUM = z.enum(["self_harm", "threat", "hate"]);
const SPEAKER_SCOPE_ENUM = z.enum(["self", "partner", "other"]);
const TIMEFRAME_ENUM = z.enum(["past", "current", "desired"]);

const RawUnderstandingSchema = z.object({
  assistant_reply: z.string().trim().min(1).max(320),
  signals: z
    .array(
      z.object({
        field: FIELD_ENUM,
        value: z.unknown(),
        confidence: z.number().min(0).max(100),
        evidence: z.string().trim().min(1).max(220),
        source: z.enum(["llm", "rule"]).optional(),
        evidence_spans: z.array(z.string().trim().min(1).max(220)).max(3).optional(),
        speaker_scope: SPEAKER_SCOPE_ENUM.optional(),
        timeframe: TIMEFRAME_ENUM.optional()
      })
    )
    .default([]),
  off_topic: z
    .object({
      category: OFF_TOPIC_ENUM.nullable(),
      confidence: z.number().min(0).max(100)
    })
    .default({ category: null, confidence: 0 }),
  safety: z
    .object({
      type: SAFETY_ENUM.nullable(),
      confidence: z.number().min(0).max(100)
    })
    .default({ type: null, confidence: 0 }),
  needs_confirmation: z
    .array(
      z.object({
        field: FIELD_ENUM,
        value: z.unknown(),
        reason: z.string().trim().min(1).max(220)
      })
    )
    .default([]),
  missing_fields: z.array(FIELD_ENUM).default([])
});

const LooseUnderstandingSchema = z
  .object({
    assistant_reply: z.unknown().optional(),
    signals: z.array(z.record(z.unknown())).optional(),
    off_topic: z.record(z.unknown()).optional(),
    safety: z.record(z.unknown()).optional(),
    needs_confirmation: z.array(z.record(z.unknown())).optional(),
    missing_fields: z.array(z.unknown()).optional()
  })
  .passthrough();

type LlmProvider = "gemini" | "groq" | "openai" | "openrouter";

type LlmFailureReason = "llm_timeout" | "llm_invalid_json" | "llm_empty" | "none";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

type ChatCompletionsResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
};

export type LucyUnderstandingOutcome = {
  understanding: LucyTurnUnderstanding;
  source: "llm" | "rule";
  fallback_reason: LlmFailureReason;
  llm_latency_ms?: number;
  schema_validation_failed: boolean;
  provider_used: LucyLlmProvider;
};

type UnderstandTurnInput = {
  state: LucySessionState;
  userMessage: string;
  missingFields: LucyAnswerField[];
};

type LlmCallResult =
  | { ok: true; provider: LlmProvider; text: string; latencyMs: number }
  | { ok: false; provider: LlmProvider; reason: Exclude<LlmFailureReason, "none">; latencyMs?: number };

const DEFAULT_PROVIDER_CHAIN: LlmProvider[] = ["gemini", "groq", "openai"];

const OUTPUT_JSON_CONTRACT = [
  "Return ONLY valid JSON.",
  "Required keys: assistant_reply, signals, off_topic, safety, needs_confirmation, missing_fields.",
  "signals item format: {field,value,confidence,evidence,source}.",
  "Optional per signal: evidence_spans (array), speaker_scope (self|partner|other), timeframe (past|current|desired).",
  "off_topic format: {category,confidence}.",
  "safety format: {type,confidence}.",
  "needs_confirmation item format: {field,value,reason}.",
  "missing_fields must be an array of canonical field names."
].join(" ");

function isEnabled(flag: string | undefined): boolean {
  const value = flag?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function understandingMode(): "llm_first_v1" | "rules_fallback" {
  const mode = process.env.LUCY_UNDERSTANDING_MODE?.trim();
  if (mode === "rules_fallback") return "rules_fallback";
  return "llm_first_v1";
}

function timeoutMs(): number {
  const parsed = Number(process.env.LUCY_LLM_TIMEOUT_MS ?? "2200");
  return Number.isFinite(parsed) && parsed > 200 ? Math.min(10000, parsed) : 2200;
}

function maxRetries(): number {
  const parsed = Number(process.env.LUCY_LLM_MAX_RETRIES ?? "1");
  return Number.isFinite(parsed) && parsed >= 0 ? Math.min(3, parsed) : 1;
}

function parseProvider(value: string): LlmProvider | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "gemini") return "gemini";
  if (normalized === "groq") return "groq";
  if (normalized === "openai") return "openai";
  if (normalized === "openrouter") return "openrouter";
  return null;
}

function providerChain(): LlmProvider[] {
  const raw = process.env.LUCY_LLM_PROVIDER_CHAIN?.trim();
  if (!raw) return DEFAULT_PROVIDER_CHAIN;
  const parsed = raw
    .split(",")
    .map((entry) => parseProvider(entry))
    .filter((entry): entry is LlmProvider => Boolean(entry));
  if (parsed.length === 0) return DEFAULT_PROVIDER_CHAIN;
  return [...new Set(parsed)];
}

function effectiveProviderChain(): LlmProvider[] {
  const configured = providerChain();
  if (configured.length === 0) return DEFAULT_PROVIDER_CHAIN;
  if (configured.length === 1 && configured[0] === "gemini" && getProviderApiKey("groq")) {
    return ["gemini", "groq"];
  }
  return configured;
}

function getProviderApiKey(provider: LlmProvider): string | null {
  if (provider === "gemini") {
    return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null;
  }
  if (provider === "groq") {
    return process.env.GROQ_API_KEY?.trim() || null;
  }
  if (provider === "openai") {
    return process.env.OPENAI_API_KEY?.trim() || null;
  }
  if (provider === "openrouter") {
    return process.env.OPENROUTER_API_KEY?.trim() || null;
  }
  return null;
}

function modelForProvider(provider: LlmProvider): string {
  if (provider === "gemini") {
    return process.env.LUCY_GEMINI_MODEL?.trim() || "gemini-2.5-flash-lite";
  }
  if (provider === "groq") {
    return process.env.LUCY_GROQ_MODEL?.trim() || "llama-3.1-8b-instant";
  }
  if (provider === "openrouter") {
    return process.env.LUCY_OPENROUTER_MODEL?.trim() || "google/gemini-2.0-flash-001";
  }
  return process.env.LUCY_OPENAI_MODEL?.trim() || process.env.LUCY_LLM_MODEL?.trim() || "gpt-4.1-mini";
}

function extractOutputText(payload: OpenAIResponse): string | null {
  if (payload.output_text && payload.output_text.trim().length > 0) {
    return payload.output_text.trim();
  }
  const chunks = payload.output?.flatMap((item) => item.content ?? []) ?? [];
  const text = chunks
    .map((chunk) => (chunk.type === "output_text" || chunk.type === "text" ? chunk.text ?? "" : ""))
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}

function extractJsonText(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1).trim();
  return raw.trim();
}

function normalizeJsonLikeText(text: string): string {
  return text
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/\u0000/g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function extractGeminiText(payload: GeminiResponse): string | null {
  const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts ?? []) ?? [];
  const text = parts
    .map((part) => part.text ?? "")
    .filter((entry) => entry.trim().length > 0)
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}

function extractChatCompletionText(payload: ChatCompletionsResponse): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    const text = content.trim();
    return text.length > 0 ? text : null;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((chunk) => (chunk.type === "text" ? chunk.text ?? "" : ""))
      .join("")
      .trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

function buildHistory(state: LucySessionState): string {
  return state.messages
    .slice(-10)
    .map((message) => `${message.role === "assistant" ? "Lucy" : "User"}: ${message.content}`)
    .join("\n");
}

function buildPrompt(input: UnderstandTurnInput): string {
  return [
    OUTPUT_JSON_CONTRACT,
    "",
    "Current stage:",
    input.state.current_stage,
    "",
    "Already extracted:",
    JSON.stringify(input.state.extracted_data),
    "",
    "Missing fields:",
    input.missingFields.join(", ") || "none",
    "",
    "Recent conversation:",
    buildHistory(input.state) || "(no history)",
    "",
    `Latest user message: ${input.userMessage}`
  ].join("\n");
}

function buildRepairPrompt(rawModelOutput: string): string {
  return [
    OUTPUT_JSON_CONTRACT,
    "",
    "Your previous output was invalid for the required schema.",
    "Rewrite it as valid JSON only. Do not add commentary.",
    "Use this exact key shape:",
    '{"assistant_reply":"...","signals":[],"off_topic":{"category":null,"confidence":0},"safety":{"type":null,"confidence":0},"needs_confirmation":[],"missing_fields":[]}',
    "If any field is unknown, use empty defaults (signals=[], needs_confirmation=[], missing_fields=[]).",
    "",
    "Previous output:",
    rawModelOutput
  ].join("\n");
}

function normalizeScalarValue(field: Exclude<LucyAnswerField, "love_expression" | "relational_strengths">, value: unknown): unknown | null {
  const allowed = FIELD_VALUES[field];
  if (typeof allowed[0] === "number") {
    const numeric =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim().length > 0
          ? Number(value.trim())
          : Number.NaN;
    if (Number.isFinite(numeric) && (allowed as readonly number[]).includes(numeric)) {
      return numeric;
    }
    return null;
  }

  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (allowed as readonly string[]).includes(normalized) ? normalized : null;
}

function normalizeListValue(field: "love_expression" | "relational_strengths", value: unknown): unknown | null {
  const allowed = new Set(FIELD_VALUES[field]);
  const rawList = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value
          .split(/[,/&]| and /gi)
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
      : [];
  const normalized = rawList
    .map((entry) => (typeof entry === "string" ? entry.trim().toLowerCase() : ""))
    .filter((entry) => entry.length > 0 && allowed.has(entry as never));
  const deduped = [...new Set(normalized)].slice(0, 2);
  return deduped.length > 0 ? deduped : null;
}

function normalizeFieldValue(field: LucyAnswerField, value: unknown): unknown | null {
  if (field === "love_expression" || field === "relational_strengths") {
    return normalizeListValue(field, value);
  }
  return normalizeScalarValue(field as Exclude<LucyAnswerField, "love_expression" | "relational_strengths">, value);
}

function isLucyField(value: unknown): value is LucyAnswerField {
  return typeof value === "string" && REQUIRED_FIELDS.includes(value as LucyAnswerField);
}

function normalizeConfidence(value: unknown, fallback = 65): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim().length > 0
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function inferSpeakerScope(text: string): "self" | "partner" | "other" {
  const lower = text.toLowerCase();
  if (/\b(my ex|ex|they|he|she|partner)\b/.test(lower)) return "partner";
  if (/\b(i|i'm|im|me|my)\b/.test(lower)) return "self";
  return "other";
}

function inferTimeframe(text: string): "past" | "current" | "desired" {
  const lower = text.toLowerCase();
  if (/\b(want|need|next|looking for|this time|going forward)\b/.test(lower)) return "desired";
  if (/\b(used to|last relationship|my ex|before|in the past|previously)\b/.test(lower)) return "past";
  return "current";
}

function normalizeLooseSignals(rawSignals: unknown): Array<z.infer<typeof RawUnderstandingSchema>["signals"][number]> {
  if (!Array.isArray(rawSignals)) return [];
  const out: Array<z.infer<typeof RawUnderstandingSchema>["signals"][number]> = [];
  for (const raw of rawSignals) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!isLucyField(row.field)) continue;
    const value = normalizeFieldValue(row.field, row.value);
    if (value === null) continue;
    const evidence =
      typeof row.evidence === "string" && row.evidence.trim().length > 0
        ? row.evidence.trim().slice(0, 220)
        : "inferred from user message";
    const evidenceSpansRaw = Array.isArray(row.evidence_spans)
      ? row.evidence_spans
          .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
          .map((entry) => entry.trim().slice(0, 220))
          .slice(0, 3)
      : [];
    const speakerScope =
      row.speaker_scope === "self" || row.speaker_scope === "partner" || row.speaker_scope === "other"
        ? row.speaker_scope
        : inferSpeakerScope(evidence);
    const timeframe =
      row.timeframe === "past" || row.timeframe === "current" || row.timeframe === "desired"
        ? row.timeframe
        : inferTimeframe(evidence);
    out.push({
      field: row.field,
      value,
      confidence: normalizeConfidence(row.confidence, 65),
      evidence,
      source: row.source === "rule" ? "rule" : "llm",
      evidence_spans: evidenceSpansRaw.length > 0 ? evidenceSpansRaw : [evidence],
      speaker_scope: speakerScope,
      timeframe
    });
  }
  return out;
}

function normalizeLooseNeedsConfirmation(
  rawNeeds: unknown
): z.infer<typeof RawUnderstandingSchema>["needs_confirmation"] {
  if (!Array.isArray(rawNeeds)) return [];
  const out: z.infer<typeof RawUnderstandingSchema>["needs_confirmation"] = [];
  for (const raw of rawNeeds) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    if (!isLucyField(row.field)) continue;
    const value = normalizeFieldValue(row.field, row.value);
    if (value === null) continue;
    const reason =
      typeof row.reason === "string" && row.reason.trim().length > 0
        ? row.reason.trim().slice(0, 220)
        : "possible ambiguity";
    out.push({
      field: row.field,
      value,
      reason
    });
  }
  return out;
}

function normalizeLooseMissingFields(rawMissing: unknown): z.infer<typeof RawUnderstandingSchema>["missing_fields"] {
  if (!Array.isArray(rawMissing)) return [];
  return rawMissing.filter((entry): entry is z.infer<typeof FIELD_ENUM> => isLucyField(entry));
}

function normalizeLoosePayload(parsed: unknown): z.infer<typeof RawUnderstandingSchema> | null {
  const loose = LooseUnderstandingSchema.safeParse(parsed);
  if (!loose.success) return null;
  const data = loose.data;

  const assistantReplyRaw = data.assistant_reply;
  const assistant_reply =
    typeof assistantReplyRaw === "string" && assistantReplyRaw.trim().length > 0
      ? assistantReplyRaw.trim().slice(0, 320)
      : "Got it. Tell me a little more so I can match this correctly.";

  const offTopicRaw = data.off_topic ?? {};
  const offTopicCategory = typeof offTopicRaw.category === "string" && OFF_TOPIC_ENUM.options.includes(offTopicRaw.category as never)
    ? (offTopicRaw.category as z.infer<typeof OFF_TOPIC_ENUM>)
    : null;

  const safetyRaw = data.safety ?? {};
  const safetyType = typeof safetyRaw.type === "string" && SAFETY_ENUM.options.includes(safetyRaw.type as never)
    ? (safetyRaw.type as z.infer<typeof SAFETY_ENUM>)
    : null;

  const candidate: z.infer<typeof RawUnderstandingSchema> = {
    assistant_reply,
    signals: normalizeLooseSignals(data.signals),
    off_topic: {
      category: offTopicCategory,
      confidence: normalizeConfidence(offTopicRaw.confidence, 0)
    },
    safety: {
      type: safetyType,
      confidence: normalizeConfidence(safetyRaw.confidence, 0)
    },
    needs_confirmation: normalizeLooseNeedsConfirmation(data.needs_confirmation),
    missing_fields: normalizeLooseMissingFields(data.missing_fields)
  };

  const strict = RawUnderstandingSchema.safeParse(candidate);
  return strict.success ? strict.data : null;
}

function sanitizeSignals(rawSignals: Array<z.infer<typeof RawUnderstandingSchema>["signals"][number]>, source: "llm" | "rule"): LucyTurnUnderstandingSignal[] {
  const byField = new Map<LucyAnswerField, LucyTurnUnderstandingSignal>();
  for (const raw of rawSignals) {
    const value = normalizeFieldValue(raw.field, raw.value);
    if (value === null) continue;
    const normalizedEvidence = raw.evidence.trim().slice(0, 220);
    const evidenceSpans = (raw.evidence_spans ?? [])
      .filter((entry) => entry.trim().length > 0)
      .map((entry) => entry.trim().slice(0, 220))
      .slice(0, 3);
    const signal: LucyTurnUnderstandingSignal = {
      field: raw.field,
      value,
      confidence: Math.max(0, Math.min(100, Math.round(raw.confidence))),
      evidence: normalizedEvidence,
      source: raw.source ?? source,
      evidence_spans: evidenceSpans.length > 0 ? evidenceSpans : [normalizedEvidence],
      speaker_scope: raw.speaker_scope ?? inferSpeakerScope(normalizedEvidence),
      timeframe: raw.timeframe ?? inferTimeframe(normalizedEvidence)
    };
    const existing = byField.get(signal.field);
    if (!existing || existing.confidence < signal.confidence) {
      byField.set(signal.field, signal);
    }
  }
  return [...byField.values()].sort((a, b) => b.confidence - a.confidence);
}

function sanitizeNeedsConfirmation(
  rawNeeds: z.infer<typeof RawUnderstandingSchema>["needs_confirmation"]
): LucyTurnUnderstanding["needs_confirmation"] {
  const dedup = new Map<LucyAnswerField, LucyTurnUnderstanding["needs_confirmation"][number]>();
  for (const entry of rawNeeds) {
    const value = normalizeFieldValue(entry.field, entry.value);
    if (value === null) continue;
    if (!dedup.has(entry.field)) {
      dedup.set(entry.field, {
        field: entry.field,
        value,
        reason: entry.reason
      });
    }
  }
  return [...dedup.values()];
}

function buildRuleSignals(rawInput: string): LucyTurnUnderstandingSignal[] {
  const signals: LucyTurnUnderstandingSignal[] = [];
  const speakerScope = inferSpeakerScope(rawInput);
  const timeframe = inferTimeframe(rawInput);
  for (const [stage, field] of Object.entries(REQUIRED_STAGE_FIELDS) as Array<[LucyStageId, LucyAnswerField | null]>) {
    if (!field || stage === "opening" || stage === "closing") continue;
    const extraction = extractForStage(stage, rawInput);
    if (!extraction.matched) continue;
    const adjusted = Math.max(0, Math.min(100, extraction.confidence - (extraction.ambiguous ? 12 : 0)));
    signals.push({
      field,
      value: extraction.value,
      confidence: adjusted,
      evidence: rawInput.slice(0, 220),
      source: "rule",
      evidence_spans: [rawInput.slice(0, 220)],
      speaker_scope: speakerScope,
      timeframe
    });
  }
  const byField = new Map<LucyAnswerField, LucyTurnUnderstandingSignal>();
  for (const signal of signals) {
    const existing = byField.get(signal.field);
    if (!existing || existing.confidence < signal.confidence) {
      byField.set(signal.field, signal);
    }
  }
  return [...byField.values()].sort((a, b) => b.confidence - a.confidence);
}

function buildRuleOutcome(
  input: UnderstandTurnInput,
  reason: LlmFailureReason,
  opts?: { schemaValidationFailed?: boolean; llmLatencyMs?: number; providerUsed?: LucyLlmProvider }
): LucyUnderstandingOutcome {
  const safetyType = detectSafetyType(input.userMessage);
  const offTopic = detectOffTopicCategory(input.userMessage);
  return {
    source: "rule",
    fallback_reason: reason,
    schema_validation_failed: Boolean(opts?.schemaValidationFailed),
    llm_latency_ms: opts?.llmLatencyMs,
    provider_used: opts?.providerUsed ?? "none",
    understanding: {
      assistant_reply: "",
      signals: buildRuleSignals(input.userMessage),
      off_topic: {
        category: offTopic,
        confidence: offTopic ? 90 : 0
      },
      safety: {
        type: safetyType,
        confidence: safetyType ? 95 : 0
      },
      needs_confirmation: [],
      missing_fields: input.missingFields
    }
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError");
}

async function callOpenAI(prompt: string): Promise<LlmCallResult> {
  const apiKey = getProviderApiKey("openai");
  if (!apiKey) return { ok: false, provider: "openai", reason: "llm_empty" };

  const responseFormatSchema = {
    type: "object",
    additionalProperties: false,
    required: ["assistant_reply", "signals", "off_topic", "safety", "needs_confirmation", "missing_fields"],
    properties: {
      assistant_reply: { type: "string" },
      signals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "value", "confidence", "evidence", "source"],
          properties: {
            field: { type: "string" },
            value: {},
            confidence: { type: "number" },
            evidence: { type: "string" },
            source: { type: "string" },
            evidence_spans: {
              type: "array",
              items: { type: "string" }
            },
            speaker_scope: { type: "string" },
            timeframe: { type: "string" }
          }
        }
      },
      off_topic: {
        type: "object",
        additionalProperties: false,
        required: ["category", "confidence"],
        properties: {
          category: { type: ["string", "null"] },
          confidence: { type: "number" }
        }
      },
      safety: {
        type: "object",
        additionalProperties: false,
        required: ["type", "confidence"],
        properties: {
          type: { type: ["string", "null"] },
          confidence: { type: "number" }
        }
      },
      needs_confirmation: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["field", "value", "reason"],
          properties: {
            field: { type: "string" },
            value: {},
            reason: { type: "string" }
          }
        }
      },
      missing_fields: {
        type: "array",
        items: { type: "string" }
      }
    }
  };

  const retries = maxRetries();
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/responses",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelForProvider("openai"),
            input: [
              {
                role: "system",
                content: [{ type: "input_text", text: LUCY_UNDERSTANDING_SYSTEM_PROMPT }]
              },
              {
                role: "user",
                content: [{ type: "input_text", text: prompt }]
              }
            ],
            text: {
              format: {
                type: "json_schema",
                name: "lucy_turn_understanding",
                schema: responseFormatSchema,
                strict: true
              }
            },
            max_output_tokens: 420,
            temperature: 0.2
          })
        },
        timeoutMs()
      );
      const latencyMs = Date.now() - started;

      if (!response.ok) {
        if (attempt < retries && isRetryableStatus(response.status)) continue;
        return {
          ok: false,
          provider: "openai",
          reason: response.status === 408 ? "llm_timeout" : "llm_empty",
          latencyMs
        };
      }

      const payload = (await response.json()) as OpenAIResponse;
      const text = extractOutputText(payload);
      if (!text) {
        if (attempt < retries) continue;
        return { ok: false, provider: "openai", reason: "llm_empty", latencyMs };
      }
      return { ok: true, provider: "openai", text, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (isAbortError(error)) {
        if (attempt < retries) continue;
        return { ok: false, provider: "openai", reason: "llm_timeout", latencyMs };
      }
      if (attempt < retries) continue;
      return { ok: false, provider: "openai", reason: "llm_empty", latencyMs };
    }
  }

  return { ok: false, provider: "openai", reason: "llm_empty" };
}

async function callGemini(prompt: string): Promise<LlmCallResult> {
  const apiKey = getProviderApiKey("gemini");
  if (!apiKey) return { ok: false, provider: "gemini", reason: "llm_empty" };

  const model = modelForProvider("gemini");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const retries = maxRetries();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: LUCY_UNDERSTANDING_SYSTEM_PROMPT }]
            },
            contents: [
              {
                role: "user",
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 420,
              responseMimeType: "application/json"
            }
          })
        },
        timeoutMs()
      );
      const latencyMs = Date.now() - started;

      if (!response.ok) {
        if (attempt < retries && isRetryableStatus(response.status)) continue;
        return {
          ok: false,
          provider: "gemini",
          reason: response.status === 408 ? "llm_timeout" : "llm_empty",
          latencyMs
        };
      }

      const payload = (await response.json()) as GeminiResponse;
      const text = extractGeminiText(payload);
      if (!text) {
        if (attempt < retries) continue;
        return { ok: false, provider: "gemini", reason: "llm_empty", latencyMs };
      }
      return { ok: true, provider: "gemini", text, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (isAbortError(error)) {
        if (attempt < retries) continue;
        return { ok: false, provider: "gemini", reason: "llm_timeout", latencyMs };
      }
      if (attempt < retries) continue;
      return { ok: false, provider: "gemini", reason: "llm_empty", latencyMs };
    }
  }

  return { ok: false, provider: "gemini", reason: "llm_empty" };
}

async function callGroq(prompt: string): Promise<LlmCallResult> {
  const apiKey = getProviderApiKey("groq");
  if (!apiKey) return { ok: false, provider: "groq", reason: "llm_empty" };

  const url = "https://api.groq.com/openai/v1/chat/completions";
  const retries = maxRetries();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelForProvider("groq"),
            messages: [
              { role: "system", content: LUCY_UNDERSTANDING_SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 420,
            temperature: 0.2
          })
        },
        timeoutMs()
      );
      const latencyMs = Date.now() - started;

      if (!response.ok) {
        if (attempt < retries && isRetryableStatus(response.status)) continue;
        return {
          ok: false,
          provider: "groq",
          reason: response.status === 408 ? "llm_timeout" : "llm_empty",
          latencyMs
        };
      }

      const payload = (await response.json()) as ChatCompletionsResponse;
      const text = extractChatCompletionText(payload);
      if (!text) {
        if (attempt < retries) continue;
        return { ok: false, provider: "groq", reason: "llm_empty", latencyMs };
      }
      return { ok: true, provider: "groq", text, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (isAbortError(error)) {
        if (attempt < retries) continue;
        return { ok: false, provider: "groq", reason: "llm_timeout", latencyMs };
      }
      if (attempt < retries) continue;
      return { ok: false, provider: "groq", reason: "llm_empty", latencyMs };
    }
  }

  return { ok: false, provider: "groq", reason: "llm_empty" };
}

async function callOpenRouter(prompt: string): Promise<LlmCallResult> {
  const apiKey = getProviderApiKey("openrouter");
  if (!apiKey) return { ok: false, provider: "openrouter", reason: "llm_empty" };

  const url = process.env.LUCY_OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai/api/v1/chat/completions";
  const retries = maxRetries();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const started = Date.now();
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(process.env.LUCY_OPENROUTER_SITE_URL?.trim()
              ? { "HTTP-Referer": process.env.LUCY_OPENROUTER_SITE_URL.trim() }
              : {}),
            ...(process.env.LUCY_OPENROUTER_APP_NAME?.trim()
              ? { "X-Title": process.env.LUCY_OPENROUTER_APP_NAME.trim() }
              : {})
          },
          body: JSON.stringify({
            model: modelForProvider("openrouter"),
            messages: [
              { role: "system", content: LUCY_UNDERSTANDING_SYSTEM_PROMPT },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" },
            max_tokens: 420,
            temperature: 0.2
          })
        },
        timeoutMs()
      );
      const latencyMs = Date.now() - started;

      if (!response.ok) {
        if (attempt < retries && isRetryableStatus(response.status)) continue;
        return {
          ok: false,
          provider: "openrouter",
          reason: response.status === 408 ? "llm_timeout" : "llm_empty",
          latencyMs
        };
      }

      const payload = (await response.json()) as ChatCompletionsResponse;
      const text = extractChatCompletionText(payload);
      if (!text) {
        if (attempt < retries) continue;
        return { ok: false, provider: "openrouter", reason: "llm_empty", latencyMs };
      }
      return { ok: true, provider: "openrouter", text, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (isAbortError(error)) {
        if (attempt < retries) continue;
        return { ok: false, provider: "openrouter", reason: "llm_timeout", latencyMs };
      }
      if (attempt < retries) continue;
      return { ok: false, provider: "openrouter", reason: "llm_empty", latencyMs };
    }
  }

  return { ok: false, provider: "openrouter", reason: "llm_empty" };
}

async function callProvider(provider: LlmProvider, prompt: string): Promise<LlmCallResult> {
  if (provider === "gemini") return callGemini(prompt);
  if (provider === "groq") return callGroq(prompt);
  if (provider === "openrouter") return callOpenRouter(prompt);
  return callOpenAI(prompt);
}

function parseUnderstandingPayload(text: string): z.infer<typeof RawUnderstandingSchema> | null {
  const raw = extractJsonText(text);
  const candidates = [raw, normalizeJsonLikeText(raw)];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const strict = RawUnderstandingSchema.safeParse(parsed);
      if (strict.success) return strict.data;
      const normalized = normalizeLoosePayload(parsed);
      if (normalized) return normalized;
    } catch {
      try {
        const parsedJson5 = JSON5.parse(candidate) as unknown;
        const strictJson5 = RawUnderstandingSchema.safeParse(parsedJson5);
        if (strictJson5.success) return strictJson5.data;
        const normalizedJson5 = normalizeLoosePayload(parsedJson5);
        if (normalizedJson5) return normalizedJson5;
      } catch {
        continue;
      }
    }
  }
  return null;
}

export async function understandTurn(input: UnderstandTurnInput): Promise<LucyUnderstandingOutcome> {
  if (understandingMode() !== "llm_first_v1" || !isEnabled(process.env.LUCY_LLM_ENABLED)) {
    return buildRuleOutcome(input, "none", { providerUsed: "none" });
  }

  const prompt = buildPrompt(input);
  const chain = effectiveProviderChain().filter((provider) => Boolean(getProviderApiKey(provider)));
  if (chain.length === 0) {
    return buildRuleOutcome(input, "llm_empty", { providerUsed: "none" });
  }

  let lastFailureReason: Exclude<LlmFailureReason, "none"> = "llm_empty";
  let lastLatency: number | undefined;
  let sawInvalidJson = false;

  for (const provider of chain) {
    const result = await callProvider(provider, prompt);
    if (!result.ok) {
      lastFailureReason = result.reason;
      lastLatency = result.latencyMs;
      continue;
    }

    let parsed = parseUnderstandingPayload(result.text);
    if (!parsed) {
      const repairResult = await callProvider(provider, buildRepairPrompt(result.text));
      if (repairResult.ok) {
        parsed = parseUnderstandingPayload(repairResult.text);
        if (parsed) {
          const signals = sanitizeSignals(parsed.signals, "llm");
          const needsConfirmation = sanitizeNeedsConfirmation(parsed.needs_confirmation);
          const missingFields = parsed.missing_fields.filter((field) => REQUIRED_FIELDS.includes(field));
          return {
            source: "llm",
            fallback_reason: "none",
            llm_latency_ms: (result.latencyMs ?? 0) + (repairResult.latencyMs ?? 0),
            schema_validation_failed: false,
            provider_used: provider,
            understanding: {
              assistant_reply: parsed.assistant_reply,
              signals,
              off_topic: parsed.off_topic,
              safety: parsed.safety,
              needs_confirmation: needsConfirmation,
              missing_fields: missingFields.length > 0 ? missingFields : input.missingFields
            }
          };
        }
      }
      sawInvalidJson = true;
      lastFailureReason = "llm_invalid_json";
      lastLatency = (result.latencyMs ?? 0) + (repairResult.latencyMs ?? 0);
      continue;
    }

    const signals = sanitizeSignals(parsed.signals, "llm");
    const needsConfirmation = sanitizeNeedsConfirmation(parsed.needs_confirmation);
    const missingFields = parsed.missing_fields.filter((field) => REQUIRED_FIELDS.includes(field));

    return {
      source: "llm",
      fallback_reason: "none",
      llm_latency_ms: result.latencyMs,
      schema_validation_failed: false,
      provider_used: result.provider,
      understanding: {
        assistant_reply: parsed.assistant_reply,
        signals,
        off_topic: parsed.off_topic,
        safety: parsed.safety,
        needs_confirmation: needsConfirmation,
        missing_fields: missingFields.length > 0 ? missingFields : input.missingFields
      }
    };
  }

  return buildRuleOutcome(input, sawInvalidJson ? "llm_invalid_json" : lastFailureReason, {
    schemaValidationFailed: sawInvalidJson,
    llmLatencyMs: lastLatency,
    providerUsed: chain.at(-1) ?? "none"
  });
}
