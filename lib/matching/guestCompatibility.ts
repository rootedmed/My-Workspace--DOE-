import {
  computeCompatibility,
  deriveAttachmentAxis,
  deriveReadinessScore,
  type LifestyleEnergy,
  type UserCompatibilityProfile
} from "@/lib/compatibility";
import { generateIncompatibilityReport, type CompatibilityProfileForReport } from "@/lib/matching/incompatibilityReport";

export type GuestAnswers = {
  past_attribution: UserCompatibilityProfile["past_attribution"];
  conflict_speed: UserCompatibilityProfile["conflict_speed"];
  love_expression: UserCompatibilityProfile["love_expression"];
  support_need: UserCompatibilityProfile["support_need"];
  emotional_openness: UserCompatibilityProfile["emotional_openness"];
  relationship_vision: UserCompatibilityProfile["relationship_vision"];
  relational_strengths: UserCompatibilityProfile["relational_strengths"];
  growth_intention: UserCompatibilityProfile["growth_intention"];
  lifestyle_energy?: LifestyleEnergy;
};

function toReportProfile(profile: UserCompatibilityProfile): CompatibilityProfileForReport {
  return {
    conflict_speed: profile.conflict_speed,
    emotional_openness: profile.emotional_openness,
    support_need: profile.support_need,
    relationship_vision: profile.relationship_vision
  };
}

export function buildGuestProfile(answers: GuestAnswers): UserCompatibilityProfile {
  const base = {
    userId: "guest",
    ...answers,
    attachment_axis: "secure" as const,
    readiness_score: 0,
    completedAt: new Date()
  };
  const attachment = deriveAttachmentAxis(base);
  const readiness = deriveReadinessScore({ ...base, attachment_axis: attachment });
  return { ...base, attachment_axis: attachment, readiness_score: readiness };
}

export function computeGuestCompatibility(host: UserCompatibilityProfile, guestAnswers: GuestAnswers, hostName: string) {
  const guest = buildGuestProfile(guestAnswers);
  const compatibility = computeCompatibility(host, guest);
  const report = generateIncompatibilityReport(
    toReportProfile(host),
    toReportProfile(guest),
    hostName,
    compatibility.score
  );
  return {
    score: compatibility.score,
    tier: compatibility.tier,
    notes: compatibility.notes,
    warnings: compatibility.warnings,
    report
  };
}
