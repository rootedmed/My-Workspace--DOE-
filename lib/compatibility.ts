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
export type LifestyleEnergy = "introspective" | "high_energy" | "social" | "intellectual" | "spontaneous";

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
  lifestyle_energy?: LifestyleEnergy;
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
  const attachmentPenalty = [0, 0, 10, 25, 40][opennessGap] ?? 40;
  score -= Math.min(attachmentPenalty * 0.75, 30);

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
  const conflictPenalty = [0, 0, 5, 15, 30][conflictGap] ?? 30;
  score -= Math.min(conflictPenalty, 25);

  if (conflictGap <= 1) {
    notes.push("You process conflict at a similar pace — that makes repair easier.");
  }
  if (conflictGap >= 3) {
    warnings.push("You have different conflict speeds. Name this early so it doesn't feel like rejection.");
  }

  const visionCompatibility: Record<RelationshipVision, Partial<Record<RelationshipVision, number>>> = {
    independent: { independent: 15, adventure: 8, friendship: 4, safe: 0, enmeshed: -20 },
    enmeshed: { enmeshed: 15, safe: 8, friendship: 4, independent: -20, adventure: -10 },
    friendship: { friendship: 15, safe: 8, adventure: 8, independent: 4, enmeshed: 4 },
    safe: { safe: 15, enmeshed: 8, friendship: 8, independent: 0, adventure: -20 },
    adventure: { adventure: 15, independent: 8, friendship: 8, safe: -20, enmeshed: -10 }
  };

  const visionDelta = visionCompatibility[a.relationship_vision]?.[b.relationship_vision] ?? 0;
  if (visionDelta >= 0) {
    score += Math.min(visionDelta, 15);
  } else {
    score -= Math.min(Math.abs(visionDelta), 25);
    warnings.push("You have different ideas of what togetherness looks like.");
  }

  if (a.relationship_vision === b.relationship_vision) {
    notes.push("You both want the same kind of relationship structure.");
  }

  const sharedExpression = a.love_expression.filter((v) => b.love_expression.includes(v)).length;
  score += sharedExpression === 2 ? 10 : sharedExpression === 1 ? 4 : 0;

  const supportPenalties: Record<SupportNeed, Partial<Record<SupportNeed, number>>> = {
    validation: { validation: 0, presence: 0, practical: -15, space: -15, distraction: -5 },
    practical: { practical: 0, distraction: -5, validation: -15, space: -5, presence: -5 },
    presence: { presence: 0, validation: 0, space: -15, practical: -5, distraction: -5 },
    space: { space: 0, distraction: 0, validation: -15, presence: -15, practical: -5 },
    distraction: { distraction: 0, practical: -5, space: 0, validation: -5, presence: -5 }
  };

  const supportDelta = supportPenalties[a.support_need]?.[b.support_need] ?? 0;
  score += supportDelta;
  if (supportDelta <= -15) {
    warnings.push("You tend to need different things when you're stressed. Worth discussing early.");
  }

  if (a.growth_intention === "depth") {
    if (b.emotional_openness <= 2) score += 10;
    if (b.emotional_openness >= 4) score -= 10;
  }
  if (a.growth_intention === "chosen") {
    if (
      b.relational_strengths.includes("consistency") ||
      b.relational_strengths.includes("loyalty")
    ) {
      score += 8;
      notes.push("They bring consistency — something you've said matters to you.");
    }
    if (b.attachment_axis === "avoidant" || b.attachment_axis === "avoidant_lean") {
      score -= 15;
    }
  }
  if (a.growth_intention === "alignment") {
    if (a.relationship_vision === b.relationship_vision) {
      notes.push("Your relationship visions are aligned — that's what you said you needed most.");
    }
  }
  if (a.growth_intention === "peace") {
    const conflictRisk = Math.abs(a.conflict_speed - b.conflict_speed);
    if (conflictRisk >= 3) score -= 10;
  }

  if (b.relational_strengths.includes("joy") && a.relationship_vision === "safe") score += 5;
  if (b.relational_strengths.includes("support") && a.relationship_vision === "adventure") score += 5;
  if (b.relational_strengths.includes("honesty") && a.growth_intention === "depth") score += 5;

  if (a.lifestyle_energy && b.lifestyle_energy) {
    if (a.lifestyle_energy === b.lifestyle_energy) {
      score += 5;
      notes.push("Your energy and social rhythm look naturally aligned.");
    } else {
      const compatiblePairs = new Set([
        "introspective:intellectual",
        "intellectual:introspective",
        "high_energy:spontaneous",
        "spontaneous:high_energy",
        "social:spontaneous",
        "spontaneous:social"
      ]);
      if (compatiblePairs.has(`${a.lifestyle_energy}:${b.lifestyle_energy}`)) {
        score += 3;
      } else if (
        (a.lifestyle_energy === "introspective" && b.lifestyle_energy === "high_energy") ||
        (a.lifestyle_energy === "high_energy" && b.lifestyle_energy === "introspective")
      ) {
        warnings.push("Different energy levels may require clear planning around social time.");
      }
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier = score >= 78 ? "strong" : score >= 60 ? "good" : score >= 42 ? "possible" : "low";

  return {
    score,
    tier,
    dimensionScores: {
      attachment: Math.max(0, 30 - Math.min(attachmentPenalty * 0.75, 30)),
      conflict: Math.max(0, 25 - Math.min(conflictPenalty, 25)),
      vision: Math.max(0, visionDelta >= 0 ? visionDelta : 25 - Math.abs(visionDelta)),
      expression: Math.min(10, sharedExpression * 5),
      growth: score - (score - 10)
    },
    notes: notes.slice(0, 3),
    warnings: warnings.slice(0, 2)
  };
}
