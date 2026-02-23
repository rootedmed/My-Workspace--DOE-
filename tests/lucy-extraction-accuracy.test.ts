import { describe, expect, it } from "vitest";
import { evaluateLucyExtractionAccuracy } from "@/lib/onboarding/lucy/extractionAccuracy";
import { LUCY_EXTRACTION_SAMPLES } from "@/tests/fixtures/lucy-extraction-samples";

describe("Lucy extraction accuracy harness", () => {
  it("computes extraction metrics for internal + pilot annotations", () => {
    const metrics = evaluateLucyExtractionAccuracy(LUCY_EXTRACTION_SAMPLES);

    expect(metrics.sample_count).toBeGreaterThanOrEqual(40);
    expect(metrics.expected_pairs).toBeGreaterThanOrEqual(40);
    expect(metrics.macro_accuracy).toBeGreaterThanOrEqual(0.85);
    expect(metrics.field_accuracy.past_attribution).toBeGreaterThanOrEqual(0.85);
    expect(metrics.field_accuracy.conflict_speed).toBeGreaterThanOrEqual(0.85);
    expect(metrics.field_accuracy.support_need).toBeGreaterThanOrEqual(0.85);
    expect(metrics.field_accuracy.emotional_openness).toBeGreaterThanOrEqual(0.85);
    expect(metrics.field_accuracy.love_expression).toBeGreaterThanOrEqual(0.85);
    expect(metrics.field_accuracy.relationship_vision).toBeGreaterThanOrEqual(0.85);
    expect(metrics.field_accuracy.relational_strengths).toBeGreaterThanOrEqual(0.85);
    expect(metrics.field_accuracy.growth_intention).toBeGreaterThanOrEqual(0.85);
  });
});

