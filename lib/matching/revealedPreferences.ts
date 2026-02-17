import { computeCompatibility, type UserCompatibilityProfile } from "@/lib/compatibility";

export type StatedVsRevealedInsight = {
  trait: "emotional_openness" | "conflict_speed" | "relationship_vision" | "lifestyle_energy";
  statedPreference: string | number | null;
  revealedPreference: string | number | null;
  confidence: number;
};

export type RevealedPreferencesRecord = {
  learnedWeights: {
    emotional_openness_preferred: number;
    conflict_speed_preferred: number;
    relationship_vision_preferred: string[];
    lifestyle_energy_preferred: string[];
  };
  statedVsRevealed: StatedVsRevealedInsight[];
  sampleSize: number;
  lastUpdated: string;
};

export type UserMatchWeights = {
  attachment: number;
  conflict: number;
  vision: number;
  expression: number;
  lifestyle: number;
};

export const DEFAULT_USER_MATCH_WEIGHTS: UserMatchWeights = {
  attachment: 1,
  conflict: 1,
  vision: 1,
  expression: 0.8,
  lifestyle: 0.5
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countBy<T extends string>(values: T[]): Array<{ value: T; count: number }> {
  const map = new Map<T, number>();
  for (const value of values) {
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return [...map.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count);
}

export function computeRevealedPreferences(
  stated: UserCompatibilityProfile,
  outcomeRows: Array<{ did_message: boolean | null; candidateProfile: UserCompatibilityProfile | null }>
): RevealedPreferencesRecord {
  const usable = outcomeRows.filter((row) => row.candidateProfile);
  const messaged = usable.filter((row) => row.did_message === true).map((row) => row.candidateProfile!);
  const ignored = usable.filter((row) => row.did_message !== true).map((row) => row.candidateProfile!);
  const sampleSize = usable.length;

  const avgMessagedOpenness = mean(messaged.map((profile) => profile.emotional_openness));
  const avgMessagedConflict = mean(messaged.map((profile) => profile.conflict_speed));
  const revealedVision = countBy(messaged.map((profile) => profile.relationship_vision)).map((entry) => entry.value);
  const revealedLifestyle = countBy(
    messaged.map((profile) => profile.lifestyle_energy).filter((value): value is string => typeof value === "string")
  ).map((entry) => entry.value);

  const confidence = Math.min(messaged.length / 20, 1);
  const insights: StatedVsRevealedInsight[] = [];

  if (messaged.length >= 5 && Math.abs(avgMessagedOpenness - stated.emotional_openness) > 1.2) {
    insights.push({
      trait: "emotional_openness",
      statedPreference: stated.emotional_openness,
      revealedPreference: Math.round(avgMessagedOpenness * 10) / 10,
      confidence
    });
  }
  if (messaged.length >= 5 && Math.abs(avgMessagedConflict - stated.conflict_speed) > 1.2) {
    insights.push({
      trait: "conflict_speed",
      statedPreference: stated.conflict_speed,
      revealedPreference: Math.round(avgMessagedConflict * 10) / 10,
      confidence
    });
  }
  if (messaged.length >= 8 && revealedVision[0] && revealedVision[0] !== stated.relationship_vision) {
    insights.push({
      trait: "relationship_vision",
      statedPreference: stated.relationship_vision,
      revealedPreference: revealedVision[0],
      confidence: Math.min(messaged.length / 25, 1)
    });
  }
  if (messaged.length >= 8 && revealedLifestyle[0] && revealedLifestyle[0] !== (stated.lifestyle_energy ?? null)) {
    insights.push({
      trait: "lifestyle_energy",
      statedPreference: stated.lifestyle_energy ?? null,
      revealedPreference: revealedLifestyle[0],
      confidence: Math.min(messaged.length / 25, 1)
    });
  }

  return {
    learnedWeights: {
      emotional_openness_preferred:
        messaged.length > 0 ? Math.round((avgMessagedOpenness - stated.emotional_openness) * 100) / 100 : 0,
      conflict_speed_preferred:
        messaged.length > 0 ? Math.round((avgMessagedConflict - stated.conflict_speed) * 100) / 100 : 0,
      relationship_vision_preferred: revealedVision,
      lifestyle_energy_preferred: revealedLifestyle
    },
    statedVsRevealed: insights,
    sampleSize,
    lastUpdated: new Date().toISOString()
  };
}

export function scoreWithLearning(
  current: UserCompatibilityProfile,
  candidate: UserCompatibilityProfile,
  revealed: RevealedPreferencesRecord | null,
  weights: UserMatchWeights | null
): number {
  const base = computeCompatibility(current, candidate);
  let score = base.score;
  const userWeights = weights ?? DEFAULT_USER_MATCH_WEIGHTS;

  score += (userWeights.attachment - 1) * (base.dimensionScores.attachment / 30) * 10;
  score += (userWeights.conflict - 1) * (base.dimensionScores.conflict / 25) * 10;
  score += (userWeights.vision - 1) * (base.dimensionScores.vision / 25) * 10;
  score += (userWeights.expression - 0.8) * (base.dimensionScores.expression / 10) * 8;
  score += (userWeights.lifestyle - 0.5) * 8;

  if (revealed && revealed.sampleSize >= 5) {
    for (const divergence of revealed.statedVsRevealed) {
      if (divergence.confidence < 0.3) continue;
      if (divergence.trait === "emotional_openness") {
        const stated = Number(divergence.statedPreference);
        const revealedTarget = Number(divergence.revealedPreference);
        const candidateDistanceToRevealed = Math.abs(candidate.emotional_openness - revealedTarget);
        const candidateDistanceToStated = Math.abs(candidate.emotional_openness - stated);
        if (candidateDistanceToRevealed < candidateDistanceToStated) {
          score += 10 * divergence.confidence;
        }
      }
      if (divergence.trait === "relationship_vision" && candidate.relationship_vision === divergence.revealedPreference) {
        score += 12 * divergence.confidence;
      }
      if (
        divergence.trait === "lifestyle_energy" &&
        candidate.lifestyle_energy &&
        candidate.lifestyle_energy === divergence.revealedPreference
      ) {
        score += 6 * divergence.confidence;
      }
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
