import { extractForStage } from "@/lib/onboarding/lucy/extractors";
import type { LucyAnswerField, LucyAnswers, LucyStageId } from "@/lib/onboarding/lucy/types";

export interface LucyExtractionSample {
  id: string;
  source: "internal" | "pilot";
  input: string;
  expected: Partial<LucyAnswers>;
}

export interface LucyExtractionMetrics {
  sample_count: number;
  expected_pairs: number;
  field_accuracy: Record<LucyAnswerField, number>;
  macro_accuracy: number;
  over_inference_rate: number;
  under_inference_rate: number;
  failure_clusters: {
    subject_confusion: number;
    negation_inversion: number;
    multi_intent_tiebreak: number;
    long_story_compression_loss: number;
    sarcasm_misread: number;
  };
}

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

function valuesEqual(field: LucyAnswerField, expected: unknown, actual: unknown): boolean {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    const expectedSet = [...expected].sort();
    const actualSet = [...actual].sort();
    return JSON.stringify(expectedSet) === JSON.stringify(actualSet);
  }

  if (field === "conflict_speed" || field === "emotional_openness") {
    return Number(expected) === Number(actual);
  }
  return expected === actual;
}

function classifyFailure(input: string, predictedConfidence: number, matched: boolean): keyof LucyExtractionMetrics["failure_clusters"] {
  const text = input.toLowerCase();
  if (/\bnot\b|\bdon't\b|\bnever\b|\bcan't\b/.test(text)) return "negation_inversion";
  if (/\bthey\b|\bmy ex\b/.test(text) && /\bi\b/.test(text)) return "subject_confusion";
  if (/\bdepends\b|\bmixed\b|\ball of the above\b/.test(text)) return "multi_intent_tiebreak";
  if (text.length > 220) return "long_story_compression_loss";
  if (!matched || predictedConfidence < 40) return "sarcasm_misread";
  return "multi_intent_tiebreak";
}

export function evaluateLucyExtractionAccuracy(samples: LucyExtractionSample[]): LucyExtractionMetrics {
  const perFieldTotals: Record<LucyAnswerField, number> = {
    past_attribution: 0,
    conflict_speed: 0,
    support_need: 0,
    emotional_openness: 0,
    love_expression: 0,
    relationship_vision: 0,
    relational_strengths: 0,
    growth_intention: 0
  };
  const perFieldCorrect: Record<LucyAnswerField, number> = {
    past_attribution: 0,
    conflict_speed: 0,
    support_need: 0,
    emotional_openness: 0,
    love_expression: 0,
    relationship_vision: 0,
    relational_strengths: 0,
    growth_intention: 0
  };

  const failureClusters: LucyExtractionMetrics["failure_clusters"] = {
    subject_confusion: 0,
    negation_inversion: 0,
    multi_intent_tiebreak: 0,
    long_story_compression_loss: 0,
    sarcasm_misread: 0
  };

  let expectedPairs = 0;
  let overInferenceCount = 0;
  let underInferenceCount = 0;

  for (const sample of samples) {
    for (const [field, expected] of Object.entries(sample.expected) as Array<[LucyAnswerField, unknown]>) {
      expectedPairs += 1;
      perFieldTotals[field] += 1;

      const stage = FIELD_TO_STAGE[field];
      const extraction = extractForStage(stage, sample.input);
      const isCorrect = extraction.matched && valuesEqual(field, expected, extraction.value);

      if (isCorrect) {
        perFieldCorrect[field] += 1;
      } else {
        const cluster = classifyFailure(sample.input, extraction.confidence, extraction.matched);
        failureClusters[cluster] += 1;
      }

      if (extraction.matched && extraction.confidence > 80 && !isCorrect) {
        overInferenceCount += 1;
      }

      if (!extraction.matched || extraction.confidence < 45) {
        underInferenceCount += 1;
      }
    }
  }

  const fieldAccuracy = Object.fromEntries(
    (Object.keys(FIELD_TO_STAGE) as LucyAnswerField[]).map((field) => {
      const total = perFieldTotals[field];
      const accuracy = total === 0 ? 1 : perFieldCorrect[field] / total;
      return [field, accuracy];
    })
  ) as Record<LucyAnswerField, number>;

  const macroAccuracy =
    (Object.keys(fieldAccuracy) as LucyAnswerField[]).reduce((sum, field) => sum + fieldAccuracy[field], 0) /
    (Object.keys(fieldAccuracy).length || 1);

  return {
    sample_count: samples.length,
    expected_pairs: expectedPairs,
    field_accuracy: fieldAccuracy,
    macro_accuracy: macroAccuracy,
    over_inference_rate: expectedPairs === 0 ? 0 : overInferenceCount / expectedPairs,
    under_inference_rate: expectedPairs === 0 ? 0 : underInferenceCount / expectedPairs,
    failure_clusters: failureClusters
  };
}

