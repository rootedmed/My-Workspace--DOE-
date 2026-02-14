import type { MatchResult, OnboardingProfile } from "@/lib/domain/types";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function similarityScore(left: number, right: number): number {
  return clamp(100 - Math.abs(left - right));
}

function intentScore(left: OnboardingProfile, right: OnboardingProfile): number {
  const labelScore =
    left.intent.lookingFor === right.intent.lookingFor
      ? 100
      : left.intent.lookingFor === "exploring" || right.intent.lookingFor === "exploring"
        ? 45
        : 75;
  const timelineScore = clamp(100 - Math.abs(left.intent.timelineMonths - right.intent.timelineMonths) * 3);
  const readinessScore = clamp(100 - Math.abs(left.intent.readiness - right.intent.readiness) * 20);
  return clamp((labelScore + timelineScore + readinessScore) / 3);
}

function lifestyleScore(left: OnboardingProfile, right: OnboardingProfile): number {
  const capacityScore = clamp(100 - Math.abs(left.intent.weeklyCapacity - right.intent.weeklyCapacity) * 15);
  const locationScore =
    left.locationPreference === right.locationPreference
      ? 100
      : left.locationPreference === "same_city" && right.locationPreference === "same_city"
        ? 100
        : 70;
  return clamp((capacityScore + locationScore) / 2);
}

function attachmentScore(left: OnboardingProfile, right: OnboardingProfile): number {
  const anxietyFit = similarityScore(left.tendencies.attachmentAnxiety, right.tendencies.attachmentAnxiety);
  const avoidanceFit = similarityScore(
    left.tendencies.attachmentAvoidance,
    right.tendencies.attachmentAvoidance
  );
  return clamp((anxietyFit + avoidanceFit) / 2);
}

function conflictRegulationScore(left: OnboardingProfile, right: OnboardingProfile): number {
  const conflictFit = similarityScore(left.tendencies.conflictRepair, right.tendencies.conflictRepair);
  const regulationFit = similarityScore(
    left.tendencies.emotionalRegulation,
    right.tendencies.emotionalRegulation
  );
  return clamp((conflictFit + regulationFit) / 2);
}

function personalityScore(left: OnboardingProfile, right: OnboardingProfile): number {
  const dimensions = [
    similarityScore(left.personality.openness, right.personality.openness),
    similarityScore(left.personality.conscientiousness, right.personality.conscientiousness),
    similarityScore(left.personality.extraversion, right.personality.extraversion),
    similarityScore(left.personality.agreeableness, right.personality.agreeableness),
    similarityScore(left.personality.emotionalStability, right.personality.emotionalStability)
  ];

  return clamp(dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length);
}

function noveltyScore(left: OnboardingProfile, right: OnboardingProfile): number {
  return similarityScore(left.tendencies.noveltyPreference, right.tendencies.noveltyPreference);
}

export function passesHardFilters(left: OnboardingProfile, right: OnboardingProfile): {
  pass: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const timelineGap = Math.abs(left.intent.timelineMonths - right.intent.timelineMonths);

  if (timelineGap > 18) {
    reasons.push("Timeline mismatch is too large for this phase.");
  }

  if (
    (left.intent.lookingFor === "marriage_minded" && right.intent.lookingFor === "exploring") ||
    (right.intent.lookingFor === "marriage_minded" && left.intent.lookingFor === "exploring")
  ) {
    reasons.push("Intent mismatch between marriage-minded and exploring.");
  }

  return { pass: reasons.length === 0, reasons };
}

export function scoreCompatibility(current: OnboardingProfile, candidate: OnboardingProfile): MatchResult {
  const hardFilter = passesHardFilters(current, candidate);
  const componentScores = {
    intent: intentScore(current, candidate),
    lifestyle: lifestyleScore(current, candidate),
    attachment: attachmentScore(current, candidate),
    conflictRegulation: conflictRegulationScore(current, candidate),
    personality: personalityScore(current, candidate),
    novelty: noveltyScore(current, candidate)
  };

  const weighted =
    componentScores.intent * 0.25 +
    componentScores.lifestyle * 0.2 +
    componentScores.attachment * 0.15 +
    componentScores.conflictRegulation * 0.2 +
    componentScores.personality * 0.15 +
    componentScores.novelty * 0.05;

  return {
    candidateId: candidate.id,
    candidateFirstName: candidate.firstName,
    totalScore: hardFilter.pass ? clamp(weighted) : 0,
    hardFilterPass: hardFilter.pass,
    reasons: hardFilter.reasons,
    componentScores
  };
}
