export type PastAttribution =
  | "misaligned_goals"
  | "conflict_comm"
  | "emotional_disconnect"
  | "autonomy"
  | "external";

export type ConflictSpeed = 1 | 2 | 3 | 4 | 5;

export type LoveExpression = "acts" | "time" | "words" | "physical" | "gifts";

export type SupportNeed =
  | "validation"
  | "practical"
  | "presence"
  | "space"
  | "distraction";

export type EmotionalOpenness = 1 | 2 | 3 | 4 | 5;

export type RelationshipVision =
  | "independent"
  | "enmeshed"
  | "friendship"
  | "safe"
  | "adventure";

export type RelationalStrength =
  | "consistency"
  | "loyalty"
  | "honesty"
  | "joy"
  | "support";

export type GrowthIntention = "depth" | "balance" | "chosen" | "peace" | "alignment";

export type AttachmentAxis =
  | "secure"
  | "anxious_lean"
  | "avoidant_lean"
  | "anxious"
  | "avoidant";

export interface UserCompatibilityProfile {
  userId: string;
  past_attribution: PastAttribution;
  conflict_speed: ConflictSpeed;
  love_expression: LoveExpression[];
  support_need: SupportNeed;
  emotional_openness: EmotionalOpenness;
  relationship_vision: RelationshipVision;
  relational_strengths: RelationalStrength[];
  growth_intention: GrowthIntention;
  attachment_axis: AttachmentAxis;
  readiness_score: number;
  completedAt: Date;
}

export interface CompatibilityResult {
  score: number;
  tier: "strong" | "good" | "possible" | "low";
  dimensionScores: {
    attachment: number;
    conflict: number;
    vision: number;
    expression: number;
    growth: number;
  };
  notes: string[];
  warnings: string[];
}

type VisionMatrix = Record<RelationshipVision, Record<RelationshipVision, number>>;
type SupportMatrix = Record<SupportNeed, Record<SupportNeed, number>>;

const ATTACHMENT_PENALTIES_BY_GAP = [0, 0, 10, 25, 40] as const;
const CONFLICT_PENALTIES_BY_GAP = [0, 0, 5, 15, 30] as const;

const VISION_COMPATIBILITY: VisionMatrix = {
  independent: { independent: 15, adventure: 8, friendship: 4, safe: 0, enmeshed: -20 },
  enmeshed: { enmeshed: 15, safe: 8, friendship: 4, independent: -20, adventure: -10 },
  friendship: { friendship: 15, safe: 8, adventure: 8, independent: 4, enmeshed: 4 },
  safe: { safe: 15, enmeshed: 8, friendship: 8, independent: 0, adventure: -20 },
  adventure: { adventure: 15, independent: 8, friendship: 8, safe: -20, enmeshed: -10 }
};

const SUPPORT_PENALTIES: SupportMatrix = {
  validation: { validation: 0, presence: 0, practical: -15, space: -15, distraction: -5 },
  practical: { practical: 0, distraction: -5, validation: -15, space: -5, presence: -5 },
  presence: { presence: 0, validation: 0, space: -15, practical: -5, distraction: -5 },
  space: { space: 0, distraction: 0, validation: -15, presence: -15, practical: -5 },
  distraction: { distraction: 0, practical: -5, space: 0, validation: -5, presence: -5 }
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getAttachmentPenalty(opennessGap: number): number {
  return ATTACHMENT_PENALTIES_BY_GAP[opennessGap as 0 | 1 | 2 | 3 | 4] ?? 40;
}

function getConflictPenalty(conflictGap: number): number {
  return CONFLICT_PENALTIES_BY_GAP[conflictGap as 0 | 1 | 2 | 3 | 4] ?? 30;
}

function getVisionDelta(a: UserCompatibilityProfile, b: UserCompatibilityProfile): number {
  return VISION_COMPATIBILITY[a.relationship_vision]?.[b.relationship_vision] ?? 0;
}

function getSupportDelta(a: UserCompatibilityProfile, b: UserCompatibilityProfile): number {
  return SUPPORT_PENALTIES[a.support_need]?.[b.support_need] ?? 0;
}

function getSharedExpressionCount(a: UserCompatibilityProfile, b: UserCompatibilityProfile): number {
  return a.love_expression.filter((value) => b.love_expression.includes(value)).length;
}

function getExpressionDelta(sharedExpression: number): number {
  return sharedExpression === 2 ? 10 : sharedExpression === 1 ? 4 : 0;
}

function getGrowthDelta(
  a: UserCompatibilityProfile,
  b: UserCompatibilityProfile,
  notes: string[]
): { growthDelta: number; growthScore: number } {
  let growthDelta = 0;

  if (a.growth_intention === "depth") {
    if (b.emotional_openness <= 2) growthDelta += 10;
    if (b.emotional_openness >= 4) growthDelta -= 10;
  }

  if (a.growth_intention === "balance") {
    if (b.relationship_vision === "independent" || b.relationship_vision === "adventure") {
      growthDelta += 8;
    }
  }

  if (a.growth_intention === "chosen") {
    if (
      b.relational_strengths.includes("consistency") ||
      b.relational_strengths.includes("loyalty")
    ) {
      growthDelta += 8;
      notes.push("They bring consistency — something you've said matters to you.");
    }
    if (b.emotional_openness >= 4) {
      growthDelta -= 15;
    }
  }

  if (a.growth_intention === "peace") {
    if (a.conflict_speed >= 4 && b.conflict_speed === 1) {
      growthDelta -= 10;
    }
    const conflictGap = Math.abs(a.conflict_speed - b.conflict_speed);
    if (conflictGap <= 1) {
      growthDelta += 5;
    }
  }

  if (a.growth_intention === "alignment" && a.relationship_vision === b.relationship_vision) {
    notes.push("Your relationship visions are aligned — that's what you said you needed most.");
  }

  if (b.relational_strengths.includes("joy") && a.relationship_vision === "safe") growthDelta += 5;
  if (b.relational_strengths.includes("support") && a.relationship_vision === "adventure") growthDelta += 5;
  if (b.relational_strengths.includes("honesty") && a.growth_intention === "depth") growthDelta += 5;

  // 0..10 output lane for UI bars.
  const growthScore = clamp(Math.round(5 + growthDelta / 3), 0, 10);
  return { growthDelta, growthScore };
}

function getTier(score: number): CompatibilityResult["tier"] {
  if (score >= 78) return "strong";
  if (score >= 60) return "good";
  if (score >= 42) return "possible";
  return "low";
}

export function deriveAttachmentAxis(profile: UserCompatibilityProfile): AttachmentAxis {
  const openness = profile.emotional_openness;
  const conflictSpeed = profile.conflict_speed;
  const attribution = profile.past_attribution;
  const growth = profile.growth_intention;

  const avoidantScore =
    (openness >= 4 ? 2 : 0) +
    (profile.support_need === "space" ? 1 : 0) +
    (profile.support_need === "distraction" ? 1 : 0) +
    (attribution === "external" ? 1 : 0) +
    (conflictSpeed >= 4 ? 1 : 0);

  const anxiousScore =
    (openness <= 2 ? 2 : 0) +
    (profile.support_need === "validation" ? 1 : 0) +
    (growth === "chosen" ? 2 : 0) +
    (conflictSpeed <= 2 ? 1 : 0);

  if (avoidantScore >= 4) return "avoidant";
  if (avoidantScore === 3) return "avoidant_lean";
  if (anxiousScore >= 4) return "anxious";
  if (anxiousScore === 3) return "anxious_lean";
  return "secure";
}

export function deriveReadinessScore(profile: Omit<UserCompatibilityProfile, "readiness_score">): number {
  let score = 55;

  if (profile.relational_strengths.length >= 1) score += 15;
  if (profile.relational_strengths.length === 2) score += 10;

  if (profile.past_attribution === "misaligned_goals" || profile.past_attribution === "conflict_comm") {
    score += 8;
  }
  if (profile.growth_intention === "alignment" || profile.growth_intention === "depth") {
    score += 8;
  }
  if (profile.growth_intention === "chosen" && profile.emotional_openness >= 4) {
    score -= 8;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeCompatibility(a: UserCompatibilityProfile, b: UserCompatibilityProfile): CompatibilityResult {
  let score = 100;
  const notes: string[] = [];
  const warnings: string[] = [];

  const opennessGap = Math.abs(a.emotional_openness - b.emotional_openness);
  const attachmentPenalty = getAttachmentPenalty(opennessGap);
  const appliedAttachmentPenalty = Math.min(attachmentPenalty * 0.75, 30);
  score -= appliedAttachmentPenalty;

  if (opennessGap === 0 || opennessGap === 1) {
    notes.push("You have similar emotional comfort zones.");
  }
  if (opennessGap >= 4) {
    warnings.push("One of you needs more emotional depth than the other tends to offer.");
  }
  if (a.attachment_axis === "anxious" && b.attachment_axis === "avoidant") {
    score -= 10;
    warnings.push("Anxious-avoidant pairings can feel like push-pull. Awareness helps.");
  }

  const conflictGap = Math.abs(a.conflict_speed - b.conflict_speed);
  const conflictPenalty = getConflictPenalty(conflictGap);
  const appliedConflictPenalty = Math.min(conflictPenalty, 25);
  score -= appliedConflictPenalty;

  if (conflictGap <= 1) {
    notes.push("You process conflict at a similar pace — that makes repair easier.");
  }
  if (conflictGap >= 3) {
    warnings.push("You have different conflict speeds. Name this early so it doesn't feel like rejection.");
  }

  let visionDelta = getVisionDelta(a, b);
  if (a.growth_intention === "alignment") {
    // Spec: "alignment" doubles relationship vision weight.
    visionDelta *= 2;
  }
  if (visionDelta >= 0) {
    score += Math.min(visionDelta, 15);
  } else {
    score -= Math.min(Math.abs(visionDelta), 25);
    warnings.push("You have different ideas of what togetherness looks like.");
  }

  if (a.relationship_vision === b.relationship_vision) {
    notes.push("You both want the same kind of relationship structure.");
  }

  const sharedExpression = getSharedExpressionCount(a, b);
  const expressionDelta = getExpressionDelta(sharedExpression);
  score += expressionDelta;

  const supportDelta = getSupportDelta(a, b);
  score += supportDelta;
  if (supportDelta <= -15) {
    warnings.push("You tend to need different things when you're stressed. Worth discussing early.");
  }

  const { growthDelta, growthScore } = getGrowthDelta(a, b, notes);
  score += growthDelta;

  score = Math.max(0, Math.min(100, Math.round(score)));
  const tier = getTier(score);

  return {
    score,
    tier,
    dimensionScores: {
      attachment: Math.max(0, 30 - appliedAttachmentPenalty),
      conflict: Math.max(0, 25 - appliedConflictPenalty),
      vision: Math.max(0, visionDelta >= 0 ? visionDelta : 25 - Math.abs(visionDelta)),
      expression: Math.min(10, sharedExpression * 5),
      growth: growthScore
    },
    notes: notes.slice(0, 3),
    warnings: warnings.slice(0, 2)
  };
}
