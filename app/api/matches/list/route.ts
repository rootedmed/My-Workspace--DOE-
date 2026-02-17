import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  computeCompatibility,
  type AttachmentAxis,
  type ConflictSpeed,
  type EmotionalOpenness,
  type GrowthIntention,
  type LoveExpression,
  type PastAttribution,
  type RelationshipVision,
  type RelationalStrength,
  type SupportNeed,
  type UserCompatibilityProfile
} from "@/lib/compatibility";

const PHOTO_BUCKET = "profile-photos";

type UserProfileRow = {
  user_id: string;
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
  completed_at: string;
};

type CompatibilityProfilePayload = {
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
  completedAt?: string;
  completed_at?: string;
};

type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

function isMissingRelationError(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === "42P01";
}

function isMissingColumnError(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === "42703";
}

function isPermissionError(error: SupabaseErrorLike | null | undefined): boolean {
  return error?.code === "42501";
}

function toCompatibilityProfile(row: UserProfileRow): UserCompatibilityProfile {
  return {
    userId: row.user_id,
    past_attribution: row.past_attribution,
    conflict_speed: row.conflict_speed,
    love_expression: row.love_expression,
    support_need: row.support_need,
    emotional_openness: row.emotional_openness,
    relationship_vision: row.relationship_vision,
    relational_strengths: row.relational_strengths,
    growth_intention: row.growth_intention,
    attachment_axis: row.attachment_axis,
    readiness_score: row.readiness_score,
    completedAt: new Date(row.completed_at)
  };
}

function fromCompatibilityPayload(userId: string, payload: CompatibilityProfilePayload): UserCompatibilityProfile {
  return {
    userId,
    past_attribution: payload.past_attribution,
    conflict_speed: payload.conflict_speed,
    love_expression: payload.love_expression,
    support_need: payload.support_need,
    emotional_openness: payload.emotional_openness,
    relationship_vision: payload.relationship_vision,
    relational_strengths: payload.relational_strengths,
    growth_intention: payload.growth_intention,
    attachment_axis: payload.attachment_axis,
    readiness_score: payload.readiness_score,
    completedAt: new Date(payload.completed_at ?? payload.completedAt ?? new Date().toISOString())
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const matchesRes = await supabase
    .from("mutual_matches")
    .select("id, user_low, user_high, created_at")
    .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (matchesRes.error) {
    return NextResponse.json({ error: "Could not load matches." }, { status: 500 });
  }

  const rawMatches = matchesRes.data ?? [];
  const counterpartIds = rawMatches.map((row) =>
    String(row.user_low) === user.id ? String(row.user_high) : String(row.user_low)
  );

  if (counterpartIds.length === 0) {
    return NextResponse.json({ matches: [] }, { status: 200 });
  }

  const [profilesRes, photosRes, currentProfileRes, counterpartProfilesRes, onboardingCompatRes] = await Promise.all([
    supabase
      .from("onboarding_profiles")
      .select("user_id, first_name, age_range, location_preference")
      .in("user_id", counterpartIds),
    supabase
      .from("user_photos")
      .select("user_id, storage_path, mime_type, image_base64")
      .in("user_id", counterpartIds)
      .eq("slot", 1),
    supabase
      .from("user_profiles")
      .select(
        "user_id, past_attribution, conflict_speed, love_expression, support_need, emotional_openness, relationship_vision, relational_strengths, growth_intention, attachment_axis, readiness_score, completed_at"
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select(
        "user_id, past_attribution, conflict_speed, love_expression, support_need, emotional_openness, relationship_vision, relational_strengths, growth_intention, attachment_axis, readiness_score, completed_at"
      ).in("user_id", counterpartIds),
    supabase
      .from("onboarding_profiles")
      .select("user_id, compatibility_profile")
      .in("user_id", [user.id, ...counterpartIds])
  ]);

  if (
    profilesRes.error ||
    photosRes.error
  ) {
    return NextResponse.json({ error: "Could not load match details." }, { status: 500 });
  }

  const currentProfileUnavailable =
    isMissingRelationError(currentProfileRes.error) || isPermissionError(currentProfileRes.error);
  const counterpartProfilesUnavailable =
    isMissingRelationError(counterpartProfilesRes.error) || isPermissionError(counterpartProfilesRes.error);
  const onboardingCompatUnavailable =
    isMissingRelationError(onboardingCompatRes.error) ||
    isMissingColumnError(onboardingCompatRes.error) ||
    isPermissionError(onboardingCompatRes.error);

  if (
    (currentProfileRes.error && !currentProfileUnavailable) ||
    (counterpartProfilesRes.error && !counterpartProfilesUnavailable) ||
    (onboardingCompatRes.error && !onboardingCompatUnavailable)
  ) {
    return NextResponse.json({ error: "Could not load match details." }, { status: 500 });
  }

  const onboardingCompatById = new Map<string, CompatibilityProfilePayload>();
  if (!onboardingCompatRes.error) {
    for (const row of onboardingCompatRes.data ?? []) {
      const payload = row.compatibility_profile as CompatibilityProfilePayload | null;
      if (payload && typeof payload === "object") {
        onboardingCompatById.set(String(row.user_id), payload);
      }
    }
  }

  const currentProfile =
    (!currentProfileRes.error && currentProfileRes.data
      ? toCompatibilityProfile(currentProfileRes.data as UserProfileRow)
      : null) ??
    (onboardingCompatById.has(user.id)
      ? fromCompatibilityPayload(user.id, onboardingCompatById.get(user.id) as CompatibilityProfilePayload)
      : null);

  const counterpartProfileById = new Map<string, UserCompatibilityProfile>();
  if (!counterpartProfilesRes.error) {
    for (const row of (counterpartProfilesRes.data ?? []) as UserProfileRow[]) {
      counterpartProfileById.set(String(row.user_id), toCompatibilityProfile(row));
    }
  }
  for (const counterpartId of counterpartIds) {
    if (counterpartProfileById.has(counterpartId)) continue;
    const payload = onboardingCompatById.get(counterpartId);
    if (payload) {
      counterpartProfileById.set(counterpartId, fromCompatibilityPayload(counterpartId, payload));
    }
  }

  const profileById = new Map<
    string,
    { firstName: string; ageRange: string | null; locationPreference: string | null }
  >(
    (profilesRes.data ?? []).map((row) => [
      String(row.user_id),
      {
        firstName: String(row.first_name),
        ageRange: typeof row.age_range === "string" ? row.age_range : null,
        locationPreference: typeof row.location_preference === "string" ? row.location_preference : null
      }
    ])
  );
  const photoPathById = new Map<string, string>();
  const photoInlineById = new Map<string, string>();
  for (const row of photosRes.data ?? []) {
    const userId = String(row.user_id);
    const path = typeof row.storage_path === "string" ? row.storage_path : "";
    const mimeType = typeof row.mime_type === "string" ? row.mime_type : "image/jpeg";
    const imageBase64 = typeof row.image_base64 === "string" ? row.image_base64 : "";
    if (path) {
      photoPathById.set(userId, path);
    }
    if (imageBase64) {
      photoInlineById.set(userId, `data:${mimeType};base64,${imageBase64}`);
    }
  }
  const photoUrlById = new Map<string, string>();

  await Promise.all(
    counterpartIds.map(async (id) => {
      const path = photoPathById.get(id);
      if (!path) return;
      const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
      if (!signed.error && signed.data?.signedUrl) {
        photoUrlById.set(id, signed.data.signedUrl);
      }
    })
  );

  const matches = rawMatches.map((row) => {
    const counterpartId = String(row.user_low) === user.id ? String(row.user_high) : String(row.user_low);
    const profile = profileById.get(counterpartId);
    const counterpartProfile = counterpartProfileById.get(counterpartId);
    const compatibility = currentProfile && counterpartProfile ? computeCompatibility(currentProfile, counterpartProfile) : null;
    return {
      id: String(row.id),
      counterpartId,
      counterpartFirstName: profile?.firstName ?? "Match",
      counterpartAgeRange: profile?.ageRange ?? null,
      counterpartLocationPreference: profile?.locationPreference ?? null,
      photoUrl: photoUrlById.get(counterpartId) ?? photoInlineById.get(counterpartId) ?? null,
      createdAt: String(row.created_at),
      compatibility
    };
  });

  matches.sort((a, b) => {
    const aScore = a.compatibility?.score ?? 0;
    const bScore = b.compatibility?.score ?? 0;
    return bScore - aScore;
  });

  return NextResponse.json({ matches }, { status: 200 });
}
