import type {
  LucyAnswerField,
  LucyAnswers,
  LucyExtractionResult,
  LucyOption,
  LucySessionState,
  LucyStageId
} from "@/lib/onboarding/lucy/types";
import { QUICK_OPTIONS, REQUIRED_STAGE_FIELDS } from "@/lib/onboarding/lucy/config";
import { normalizeText } from "@/lib/onboarding/lucy/detectors";

const yesNoMap: Record<string, boolean> = {
  yes: true,
  y: true,
  no: false,
  n: false
};

function includesAny(text: string, words: readonly string[]): boolean {
  return words.some((word) => text.includes(word));
}

function keywordScore(text: string, words: readonly string[]): number {
  return words.reduce((sum, word) => (text.includes(word) ? sum + 1 : sum), 0);
}

function hasPartnerOnlyContext(text: string): boolean {
  const partnerContext = /\b(my ex|ex|they|he|she|partner)\b/.test(text);
  const selfContext = /\b(i|i'm|im|me|my needs?|i need|i want|for me|i usually|i prefer|i try)\b/.test(text.replace(/my ex/g, ""));
  const selfConflictIntent = /\bi\b[^.]{0,35}\b(resolve|talk|process|cool down|need space|step back)\b/.test(text);
  if (partnerContext && !selfConflictIntent) {
    return true;
  }
  return partnerContext && !selfContext;
}

function parseQuickSelection(rawInput: string, options: LucyOption[]): string[] {
  const text = normalizeText(rawInput);
  if (!text) return [];

  const byNumber = text.match(/\b([1-5])\b/g)?.map((entry) => String(Number(entry))) ?? [];
  const byValue = options.filter((opt) => text.includes(opt.value)).map((opt) => opt.value);
  const byLabel = options.filter((opt) => text.includes(normalizeText(opt.label))).map((opt) => opt.value);

  const merged = [...byValue, ...byLabel];
  if (merged.length > 0) return [...new Set(merged)];

  if (byNumber.length > 0 && options.some((opt) => /^\d$/.test(opt.value))) {
    return byNumber;
  }

  if (byNumber.length > 0) {
    return byNumber
      .map((n) => {
        const idx = Number(n) - 1;
        return idx >= 0 && idx < options.length ? options[idx]?.value ?? null : null;
      })
      .filter((value): value is string => Boolean(value));
  }

  return [];
}

export function extractPastAttribution(rawInput: string): LucyExtractionResult<LucyAnswers["past_attribution"]> {
  const text = normalizeText(rawInput);
  if (!text) return { matched: false, confidence: 0, ambiguous: true };

  if (
    includesAny(text, [
      "mixed intentions",
      "no commitment",
      "not serious",
      "casual only",
      "hook ups",
      "hookups",
      "situationship",
      "situationships",
      "sin etiquetas",
      "sin compromiso",
      "solo casual",
      "algo serio",
      "different goals",
      "different directions",
      "wanted different things",
      "timeline mismatch",
      "flaky",
      "breadcrumb",
      "no labels",
      "seeing other people"
    ])
  ) {
    return { matched: true, value: "misaligned_goals", confidence: 90, ambiguous: false };
  }

  if (
    includesAny(text, [
      "emotionally unavailable",
      "emotional distance",
      "emotionally distant",
      "no emotional depth",
      "felt unseen",
      "felt alone",
      "shut down when emotional",
      "shut down every time things got emotional",
      "unavailable emotionally"
    ])
  ) {
    return { matched: true, value: "emotional_disconnect", confidence: 88, ambiguous: false };
  }

  const map = [
    {
      value: "misaligned_goals",
      words: [
        "different goals",
        "different directions",
        "long-term",
        "life goals",
        "future mismatch",
        "hook ups",
        "hookups",
        "casual only",
        "situationship",
        "situationships",
        "sin etiquetas",
        "sin compromiso",
        "solo casual",
        "algo serio",
        "no commitment",
        "not serious"
      ]
    },
    {
      value: "conflict_comm",
      words: [
        "communication",
        "argue",
        "fighting",
        "misunderstood",
        "couldn't resolve",
        "silent treatment",
        "shut down during fights",
        "bad at communication"
      ]
    },
    {
      value: "emotional_disconnect",
      words: [
        "disconnected",
        "emotionally distant",
        "unseen",
        "not heard",
        "cold",
        "emotionally unavailable",
        "unavailable emotionally",
        "no emotional depth",
        "felt alone",
        "not there for me"
      ]
    },
    { value: "autonomy", words: ["space", "independence", "too controlling", "smothered", "needed freedom"] },
    { value: "external", words: ["timing", "distance", "work", "family", "circumstance", "external"] }
  ] as const;

  const scored = map
    .map((entry) => ({ value: entry.value, score: keywordScore(text, entry.words) }))
    .sort((a, b) => b.score - a.score);

  if ((scored[0]?.score ?? 0) === 0) {
    return { matched: false, confidence: text.length > 80 ? 45 : 25, ambiguous: true };
  }
  const top = scored[0]!;
  const second = scored[1]?.score ?? 0;
  const emotionalScore = scored.find((entry) => entry.value === "emotional_disconnect")?.score ?? 0;
  const conflictScore = scored.find((entry) => entry.value === "conflict_comm")?.score ?? 0;
  if (top.value === "conflict_comm" && emotionalScore > 0 && conflictScore - emotionalScore <= 1) {
    return {
      matched: true,
      value: "emotional_disconnect",
      confidence: Math.min(94, 78 + emotionalScore * 8),
      ambiguous: false
    };
  }
  const ambiguous = second > 0 && top.score - second <= 1;
  const confidence = Math.min(95, 62 + top.score * 20 - (ambiguous ? 15 : 0));
  return {
    matched: true,
    value: top.value as LucyAnswers["past_attribution"],
    confidence,
    ambiguous
  };
}

export function extractConflictSpeed(rawInput: string): LucyExtractionResult<LucyAnswers["conflict_speed"]> {
  const text = normalizeText(rawInput);
  if (!text) return { matched: false, confidence: 0, ambiguous: true };

  if (hasPartnerOnlyContext(text)) {
    return { matched: false, confidence: 30, ambiguous: true };
  }

  const quick = parseQuickSelection(rawInput, QUICK_OPTIONS.conflict_speed);
  const quickValue = Number(quick[0]);
  if (quickValue >= 1 && quickValue <= 5) {
    return {
      matched: true,
      value: quickValue as LucyAnswers["conflict_speed"],
      confidence: 96,
      ambiguous: false
    };
  }

  if (
    includesAny(text, [
      "pretty quickly",
      "soon after",
      "after i cool down",
      "cool down",
      "cool off",
      "lean in",
      "30 minutes",
      "half hour",
      "a bit then talk"
    ])
  ) {
    return { matched: true, value: 2, confidence: 84, ambiguous: false };
  }
  if (
    /resolve(?:\s+\w+){0,3}\s+quickly/.test(text) &&
    !includesAny(text, ["30 minutes", "half hour", "cool down", "cool off"])
  ) {
    return { matched: true, value: 1, confidence: 88, ambiguous: false };
  }
  if (
    includesAny(text, [
      "right away",
      "immediately",
      "talk now",
      "talk-now",
      "in the moment",
      "resolve now",
      "asap",
      "straight away",
      "i usually talk quickly"
    ])
  ) {
    return { matched: true, value: 1, confidence: 88, ambiguous: false };
  }
  if (
    includesAny(text, ["space", "need time", "cool down"]) &&
    includesAny(text, ["talk it through", "talk through", "then talk", "then resolve"])
  ) {
    return { matched: true, value: 3, confidence: 82, ambiguous: true };
  }
  if (includesAny(text, ["depends", "sometimes", "varies"])) {
    return { matched: true, value: 3, confidence: 78, ambiguous: true };
  }
  if (includesAny(text, ["need time", "process first", "think first", "step back"])) {
    return { matched: true, value: 4, confidence: 84, ambiguous: false };
  }
  if (includesAny(text, ["go silent", "days", "need a lot of space", "shut down"])) {
    return { matched: true, value: 5, confidence: 90, ambiguous: false };
  }

  return { matched: false, confidence: text.length > 100 ? 45 : 28, ambiguous: true };
}

export function extractSupportNeed(rawInput: string): LucyExtractionResult<LucyAnswers["support_need"]> {
  const text = normalizeText(rawInput);
  if (!text) return { matched: false, confidence: 0, ambiguous: true };

  const quick = parseQuickSelection(rawInput, QUICK_OPTIONS.support_need);
  if (quick[0]) {
    return {
      matched: true,
      value: quick[0] as LucyAnswers["support_need"],
      confidence: 95,
      ambiguous: false
    };
  }

  const map = [
    { value: "validation", words: ["listen", "heard", "validate", "validation", "reassurance", "reassure", "understand me", "talk it out", "hear me"] },
    { value: "practical", words: ["help solve", "practical", "practical help", "fix", "take off my plate", "solutions", "problem solve"] },
    { value: "presence", words: ["be with me", "hold me", "close", "presence", "presence first", "stay near", "be there with me", "be there"] },
    { value: "space", words: ["space", "alone", "leave me", "check in later", "check in"] },
    { value: "distraction", words: ["distract", "get out", "take my mind off", "lighten mood"] }
  ] as const;

  const scored = map
    .map((entry) => ({ value: entry.value, score: keywordScore(text, entry.words) }))
    .sort((a, b) => b.score - a.score);

  if ((scored[0]?.score ?? 0) === 0) {
    return { matched: false, confidence: 25, ambiguous: true };
  }

  const ambiguous = (scored[1]?.score ?? 0) > 0 && (scored[0]?.score ?? 0) - (scored[1]?.score ?? 0) <= 1;
  return {
    matched: true,
    value: scored[0]!.value as LucyAnswers["support_need"],
    confidence: Math.min(94, 62 + scored[0]!.score * 20 - (ambiguous ? 10 : 0)),
    ambiguous
  };
}

export function extractEmotionalOpenness(rawInput: string): LucyExtractionResult<LucyAnswers["emotional_openness"]> {
  const text = normalizeText(rawInput);
  if (!text) return { matched: false, confidence: 0, ambiguous: true };

  const quick = parseQuickSelection(rawInput, QUICK_OPTIONS.emotional_openness);
  const quickValue = Number(quick[0]);
  if (quickValue >= 1 && quickValue <= 5) {
    return {
      matched: true,
      value: quickValue as LucyAnswers["emotional_openness"],
      confidence: 96,
      ambiguous: false
    };
  }

  if (includesAny(text, ["open up once safe", "open with trust", "slow to open", "once i trust", "once i feel safe", "open after trust"])) {
    return { matched: true, value: 2, confidence: 84, ambiguous: false };
  }
  if (/\bopen\b/.test(text) && /\btrust|safe\b/.test(text) && !/\bnot open\b/.test(text)) {
    return { matched: true, value: 2, confidence: 84, ambiguous: false };
  }
  if (includesAny(text, ["very open", "share deeply", "open book", "emotionally open", "open up fast", "open quickly"])) {
    return { matched: true, value: 1, confidence: 90, ambiguous: false };
  }
  if (includesAny(text, ["depends", "mixed", "working on it"])) {
    return { matched: true, value: 3, confidence: 76, ambiguous: true };
  }
  if (includesAny(text, ["private", "selective", "guarded", "selective with emotions", "guarded at first"])) {
    return { matched: true, value: 4, confidence: 86, ambiguous: false };
  }
  if (includesAny(text, ["self-contained", "keep it in", "rarely share", "very private"])) {
    return { matched: true, value: 5, confidence: 90, ambiguous: false };
  }

  return { matched: false, confidence: 30, ambiguous: true };
}

function parseTopMulti(rawInput: string, options: LucyOption[], max = 2): string[] {
  const quick = parseQuickSelection(rawInput, options);
  if (quick.length > 0) return [...new Set(quick)].slice(0, max);

  const text = normalizeText(rawInput);
  const hits = options
    .map((opt) => ({
      value: opt.value,
      score:
        (text.includes(opt.value) ? 2 : 0) +
        (text.includes(normalizeText(opt.label)) ? 2 : 0) +
        (opt.hint && text.includes(normalizeText(opt.hint)) ? 1 : 0)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.value);

  return [...new Set(hits)].slice(0, max);
}

export function extractLoveExpression(rawInput: string): LucyExtractionResult<LucyAnswers["love_expression"]> {
  const selections = parseTopMulti(rawInput, QUICK_OPTIONS.love_expression, 2);
  if (selections.length === 0) {
    return { matched: false, confidence: 25, ambiguous: true };
  }
  return {
    matched: true,
    value: selections as LucyAnswers["love_expression"],
    confidence: selections.length === 2 ? 88 : 82,
    ambiguous: selections.length === 1
  };
}

export function extractRelationshipVision(rawInput: string): LucyExtractionResult<LucyAnswers["relationship_vision"]> {
  const selections = parseTopMulti(rawInput, QUICK_OPTIONS.relationship_vision, 1);
  if (!selections[0]) return { matched: false, confidence: 30, ambiguous: true };
  return {
    matched: true,
    value: selections[0] as LucyAnswers["relationship_vision"],
    confidence: 88,
    ambiguous: false
  };
}

export function extractRelationalStrengths(rawInput: string): LucyExtractionResult<LucyAnswers["relational_strengths"]> {
  const selections = parseTopMulti(rawInput, QUICK_OPTIONS.relational_strengths, 2);
  if (selections.length === 0) return { matched: false, confidence: 25, ambiguous: true };
  return {
    matched: true,
    value: selections as LucyAnswers["relational_strengths"],
    confidence: selections.length === 2 ? 88 : 82,
    ambiguous: selections.length === 1
  };
}

export function extractGrowthIntention(rawInput: string): LucyExtractionResult<LucyAnswers["growth_intention"]> {
  const selections = parseTopMulti(rawInput, QUICK_OPTIONS.growth_intention, 1);
  if (!selections[0]) return { matched: false, confidence: 25, ambiguous: true };
  return {
    matched: true,
    value: selections[0] as LucyAnswers["growth_intention"],
    confidence: 88,
    ambiguous: false
  };
}

export function extractForStage(stage: LucyStageId, rawInput: string): LucyExtractionResult<unknown> {
  switch (stage) {
    case "past_attribution":
      return extractPastAttribution(rawInput);
    case "conflict_speed":
      return extractConflictSpeed(rawInput);
    case "support_need":
      return extractSupportNeed(rawInput);
    case "emotional_openness":
      return extractEmotionalOpenness(rawInput);
    case "love_expression":
      return extractLoveExpression(rawInput);
    case "relationship_vision":
      return extractRelationshipVision(rawInput);
    case "relational_strengths":
      return extractRelationalStrengths(rawInput);
    case "growth_intention":
      return extractGrowthIntention(rawInput);
    default:
      return { matched: false, confidence: 0, ambiguous: true };
  }
}

export function inferCrossStagePrefills(rawInput: string, state: LucySessionState): Array<{
  field: LucyAnswerField;
  value: unknown;
  confidence: number;
}> {
  const prefills: Array<{ field: LucyAnswerField; value: unknown; confidence: number }> = [];
  const stages = Object.keys(REQUIRED_STAGE_FIELDS).filter((key) => key !== "opening" && key !== "closing") as LucyStageId[];

  for (const stage of stages) {
    const field = REQUIRED_STAGE_FIELDS[stage];
    if (!field) continue;
    if (field in state.extracted_data) continue;

    const result = extractForStage(stage, rawInput);
    if (result.matched && result.confidence >= 85) {
      prefills.push({
        field,
        value: result.value,
        confidence: result.confidence
      });
    }
  }

  return prefills;
}

export function parseQuickModeAnswer(field: LucyAnswerField, rawInput: string): unknown {
  const options = QUICK_OPTIONS[field];
  const selections = parseQuickSelection(rawInput, options);
  if (selections.length === 0) return undefined;

  if (field === "love_expression" || field === "relational_strengths") {
    return [...new Set(selections)].slice(0, 2);
  }

  if (field === "conflict_speed" || field === "emotional_openness") {
    const numeric = Number(selections[0]);
    return Number.isFinite(numeric) ? numeric : undefined;
  }

  return selections[0];
}

export function isLikelyOnTopic(stage: LucyStageId, rawInput: string): boolean {
  const field = REQUIRED_STAGE_FIELDS[stage];
  if (!field) return true;
  const result = extractForStage(stage, rawInput);
  return result.matched || result.confidence >= 45;
}

export function hasAllRequiredAnswers(data: Partial<LucyAnswers>): data is LucyAnswers {
  return Boolean(
    data.past_attribution &&
      data.conflict_speed &&
      data.support_need &&
      data.emotional_openness &&
      data.love_expression &&
      data.love_expression.length >= 1 &&
      data.relationship_vision &&
      data.relational_strengths &&
      data.relational_strengths.length >= 1 &&
      data.growth_intention
  );
}

export function parseConsent(rawInput: string): boolean | null {
  const text = normalizeText(rawInput);
  if (!text) return null;

  if (text.includes("quick")) return false;
  for (const [key, value] of Object.entries(yesNoMap)) {
    if (text === key || text.includes(`${key} `) || text.includes(` ${key}`)) return value;
  }
  if (text.includes("ready") || text.includes("start")) return true;
  return null;
}
