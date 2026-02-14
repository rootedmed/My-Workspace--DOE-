import type { BigFive, Tendencies } from "@/lib/domain/types";
import type { OnboardingPayload } from "@/lib/validation/onboarding";

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function likertTo100(value: number): number {
  return clampScore(((value - 1) / 4) * 100);
}

function average(values: number[]): number {
  return values.reduce((sum, current) => sum + current, 0) / values.length;
}

export function scoreTendencies(payload: OnboardingPayload): Tendencies {
  const attachmentAnxiety = likertTo100(average(payload.attachment.anxiety));
  const attachmentAvoidance = likertTo100(average(payload.attachment.avoidance));
  const conflictRepair = likertTo100(
    average([payload.conflict.startupSoftness, payload.conflict.repairAfterConflict])
  );
  const emotionalRegulation = likertTo100(
    average([payload.regulation.calmUnderStress, payload.regulation.pauseBeforeReacting])
  );

  return {
    attachmentAnxiety,
    attachmentAvoidance,
    conflictRepair,
    emotionalRegulation,
    noveltyPreference: likertTo100(payload.noveltyPreference)
  };
}

export function scorePersonality(payload: OnboardingPayload): BigFive {
  return {
    openness: likertTo100(payload.personality.openness),
    conscientiousness: likertTo100(payload.personality.conscientiousness),
    extraversion: likertTo100(payload.personality.extraversion),
    agreeableness: likertTo100(payload.personality.agreeableness),
    emotionalStability: likertTo100(payload.personality.emotionalStability)
  };
}

export function summarizeTendencies(tendencies: Tendencies): string[] {
  const lines: string[] = [];

  if (tendencies.attachmentAnxiety >= 65) {
    lines.push("You may seek frequent reassurance when connection feels uncertain.");
  } else if (tendencies.attachmentAnxiety <= 35) {
    lines.push("You appear relatively steady when relationship uncertainty appears.");
  }

  if (tendencies.attachmentAvoidance >= 65) {
    lines.push("You may prefer extra space before discussing emotionally intense topics.");
  } else if (tendencies.attachmentAvoidance <= 35) {
    lines.push("You appear generally comfortable with emotional closeness.");
  }

  if (tendencies.conflictRepair >= 60) {
    lines.push("You report strong repair habits after conflict.");
  } else {
    lines.push("You may benefit from deliberate repair routines after tense moments.");
  }

  return lines;
}
