import type { UserCompatibilityProfile } from "@/lib/compatibility";

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    return null;
  }
  return value;
}

export function toCompatibilityProfileFromRow(
  userId: string,
  row: Record<string, unknown> | null
): UserCompatibilityProfile | null {
  if (!row) return null;
  const raw = row.compatibility_profile;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const profile = raw as Record<string, unknown>;
  const past_attribution = asString(profile.past_attribution);
  const conflict_speed = asNumber(profile.conflict_speed);
  const love_expression = asStringArray(profile.love_expression);
  const support_need = asString(profile.support_need);
  const emotional_openness = asNumber(profile.emotional_openness);
  const relationship_vision = asString(profile.relationship_vision);
  const relational_strengths = asStringArray(profile.relational_strengths);
  const growth_intention = asString(profile.growth_intention);
  const attachment_axis = asString(profile.attachment_axis);
  const readiness_score = asNumber(profile.readiness_score);

  if (
    !past_attribution ||
    !conflict_speed ||
    !love_expression ||
    !support_need ||
    !emotional_openness ||
    !relationship_vision ||
    !relational_strengths ||
    !growth_intention ||
    !attachment_axis ||
    readiness_score === null
  ) {
    return null;
  }

  return {
    userId,
    past_attribution: past_attribution as UserCompatibilityProfile["past_attribution"],
    conflict_speed: conflict_speed as UserCompatibilityProfile["conflict_speed"],
    love_expression: love_expression as UserCompatibilityProfile["love_expression"],
    support_need: support_need as UserCompatibilityProfile["support_need"],
    emotional_openness: emotional_openness as UserCompatibilityProfile["emotional_openness"],
    relationship_vision: relationship_vision as UserCompatibilityProfile["relationship_vision"],
    relational_strengths: relational_strengths as UserCompatibilityProfile["relational_strengths"],
    growth_intention: growth_intention as UserCompatibilityProfile["growth_intention"],
    lifestyle_energy: asString(profile.lifestyle_energy) as UserCompatibilityProfile["lifestyle_energy"],
    attachment_axis: attachment_axis as UserCompatibilityProfile["attachment_axis"],
    readiness_score,
    completedAt: new Date(asString(profile.completedAt) ?? new Date().toISOString())
  };
}
