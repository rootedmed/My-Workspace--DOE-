import type { AgeRange, LookingFor, LocationPreference } from "@/lib/domain/types";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ProfileMissingField =
  | "date_of_birth"
  | "current_city"
  | "gender_identity"
  | "interested_in"
  | "relationship_intention"
  | "photos"
  | "about";

export type UserProfileRecord = {
  userId: string;
  dateOfBirth: string | null;
  currentCity: string | null;
  genderIdentity: string | null;
  interestedIn: string[];
  relationshipIntention: string | null;
  sexualOrientation: string | null;
  heightCm: number | null;
  work: string | null;
  education: string | null;
  bio: string | null;
  promptAnswer: string | null;
  distanceKm: number | null;
  drinking: string | null;
  smoking: string | null;
  exercise: string | null;
  religion: string | null;
  politics: string | null;
  familyPlans: string | null;
  pets: string | null;
  interests: string[];
  setupCompleted: boolean;
  setupCompletedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ProfileSetupState = {
  profile: UserProfileRecord | null;
  photoCount: number;
  missingRequired: ProfileMissingField[];
  completionPercent: number;
  isComplete: boolean;
};

const OPTIONAL_FIELDS: Array<keyof UserProfileRecord> = [
  "sexualOrientation",
  "heightCm",
  "work",
  "education",
  "distanceKm",
  "drinking",
  "smoking",
  "exercise",
  "religion",
  "politics",
  "familyPlans",
  "pets"
];

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
}

function asInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value);
}

function mapRow(row: Record<string, unknown>): UserProfileRecord {
  return {
    userId: String(row.user_id),
    dateOfBirth: asTrimmedString(row.date_of_birth),
    currentCity: asTrimmedString(row.current_city),
    genderIdentity: asTrimmedString(row.gender_identity),
    interestedIn: asStringArray(row.interested_in),
    relationshipIntention: asTrimmedString(row.relationship_intention),
    sexualOrientation: asTrimmedString(row.sexual_orientation),
    heightCm: asInt(row.height_cm),
    work: asTrimmedString(row.work),
    education: asTrimmedString(row.education),
    bio: asTrimmedString(row.bio),
    promptAnswer: asTrimmedString(row.prompt_answer),
    distanceKm: asInt(row.distance_km),
    drinking: asTrimmedString(row.drinking),
    smoking: asTrimmedString(row.smoking),
    exercise: asTrimmedString(row.exercise),
    religion: asTrimmedString(row.religion),
    politics: asTrimmedString(row.politics),
    familyPlans: asTrimmedString(row.family_plans),
    pets: asTrimmedString(row.pets),
    interests: asStringArray(row.interests),
    setupCompleted: Boolean(row.setup_completed),
    setupCompletedAt: asTrimmedString(row.setup_completed_at),
    createdAt: asTrimmedString(row.created_at),
    updatedAt: asTrimmedString(row.updated_at)
  };
}

function hasAbout(profile: UserProfileRecord | null): boolean {
  if (!profile) return false;
  return Boolean(profile.bio) || Boolean(profile.promptAnswer);
}

export function computeMissingRequired(
  profile: UserProfileRecord | null,
  photoCount: number
): ProfileMissingField[] {
  const missing: ProfileMissingField[] = [];

  if (!profile?.dateOfBirth) missing.push("date_of_birth");
  if (!profile?.currentCity) missing.push("current_city");
  if (!profile?.genderIdentity) missing.push("gender_identity");
  if (!profile?.interestedIn?.length) missing.push("interested_in");
  if (!profile?.relationshipIntention) missing.push("relationship_intention");
  if (photoCount < 2) missing.push("photos");
  if (!hasAbout(profile)) missing.push("about");

  return missing;
}

export function computeProfileCompletionPercent(
  profile: UserProfileRecord | null,
  photoCount: number
): number {
  const requiredTotal = 7;
  const requiredComplete = requiredTotal - computeMissingRequired(profile, photoCount).length;
  const optionalTotal = OPTIONAL_FIELDS.length + 1;
  let optionalComplete = 0;

  if (profile) {
    for (const key of OPTIONAL_FIELDS) {
      const value = profile[key];
      if (typeof value === "string" && value.length > 0) optionalComplete += 1;
      if (typeof value === "number") optionalComplete += 1;
    }
    if (profile.interests.length > 0) optionalComplete += 1;
  }

  const weightedRequired = requiredComplete / requiredTotal;
  const weightedOptional = optionalTotal > 0 ? optionalComplete / optionalTotal : 0;
  return Math.round((weightedRequired * 0.75 + weightedOptional * 0.25) * 100);
}

export async function getUserProfileSetupState(userId: string): Promise<ProfileSetupState> {
  const supabase = await createServerSupabaseClient();

  const [profileRes, photosRes] = await Promise.all([
    supabase
      .from("user_profiles")
      .select(
        "user_id, date_of_birth, current_city, gender_identity, interested_in, relationship_intention, sexual_orientation, height_cm, work, education, bio, prompt_answer, distance_km, drinking, smoking, exercise, religion, politics, family_plans, pets, interests, setup_completed, setup_completed_at, created_at, updated_at"
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_photos")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
  ]);

  const profile =
    profileRes.data && typeof profileRes.data === "object"
      ? mapRow(profileRes.data as Record<string, unknown>)
      : null;
  const photoCount = typeof photosRes.count === "number" ? photosRes.count : 0;
  const missingRequired = computeMissingRequired(profile, photoCount);

  return {
    profile,
    photoCount,
    missingRequired,
    completionPercent: computeProfileCompletionPercent(profile, photoCount),
    isComplete: missingRequired.length === 0
  };
}

function yearsBetween(dateOfBirth: string, now = new Date()): number | null {
  const parsed = new Date(dateOfBirth);
  if (Number.isNaN(parsed.getTime())) return null;

  let age = now.getUTCFullYear() - parsed.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - parsed.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < parsed.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export function ageRangeFromDateOfBirth(dateOfBirth: string | null): AgeRange | null {
  if (!dateOfBirth) return null;
  const age = yearsBetween(dateOfBirth);
  if (age === null || age < 18) return null;
  if (age <= 30) return "24_30";
  if (age <= 37) return "31_37";
  if (age <= 45) return "38_45";
  return "46_plus";
}

export function locationPreferenceFromDistance(distanceKm: number | null): LocationPreference {
  if (distanceKm === null) return "same_city";
  if (distanceKm <= 35) return "same_city";
  if (distanceKm <= 150) return "relocatable";
  return "remote_ok";
}

export function lookingForFromProfileValue(value: string | null): LookingFor {
  if (value === "marriage_minded") return "marriage_minded";
  if (value === "exploring") return "exploring";
  return "serious_relationship";
}
