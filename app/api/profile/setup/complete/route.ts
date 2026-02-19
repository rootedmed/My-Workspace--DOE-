import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { assertWriteAllowed } from "@/lib/config/env.server";
import {
  ageRangeFromDateOfBirth,
  getUserProfileSetupState,
  locationPreferenceFromDistance,
  lookingForFromProfileValue
} from "@/lib/profile/setup";

export async function POST(request: Request) {
  try {
    assertWriteAllowed();
  } catch {
    return NextResponse.json({ error: "Preview is read-only." }, { status: 503 });
  }

  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = await getUserProfileSetupState(user.id);
  if (!setup.profile || setup.missingRequired.length > 0) {
    return NextResponse.json(
      {
        error: "Complete required profile fields first.",
        missingRequired: setup.missingRequired
      },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();

  const profileMarkRes = await supabase
    .from("user_profiles")
    .update({
      setup_completed: true,
      setup_completed_at: nowIso,
      updated_at: nowIso
    })
    .eq("user_id", user.id)
    .select("user_id")
    .single();

  if (profileMarkRes.error) {
    return NextResponse.json({ error: "Could not finalize profile setup." }, { status: 500 });
  }

  const onboardingRes = await supabase
    .from("onboarding_profiles")
    .select("intent")
    .eq("user_id", user.id)
    .maybeSingle();

  if (onboardingRes.error || !onboardingRes.data) {
    return NextResponse.json({ error: "Onboarding profile is missing." }, { status: 400 });
  }

  const existingIntent =
    onboardingRes.data.intent && typeof onboardingRes.data.intent === "object"
      ? (onboardingRes.data.intent as Record<string, unknown>)
      : {};
  const lookingFor = lookingForFromProfileValue(setup.profile.relationshipIntention);
  const nextIntent = {
    lookingFor,
    timelineMonths:
      typeof existingIntent.timelineMonths === "number"
        ? existingIntent.timelineMonths
        : typeof existingIntent.timeline_months === "number"
          ? existingIntent.timeline_months
          : 12,
    readiness:
      typeof existingIntent.readiness === "number"
        ? existingIntent.readiness
        : typeof existingIntent.readiness_score === "number"
          ? existingIntent.readiness_score
          : 3,
    weeklyCapacity:
      typeof existingIntent.weeklyCapacity === "number"
        ? existingIntent.weeklyCapacity
        : typeof existingIntent.weekly_capacity === "number"
          ? existingIntent.weekly_capacity
          : 3
  };

  const ageRange = ageRangeFromDateOfBirth(setup.profile.dateOfBirth) ?? "31_37";
  const locationPreference = locationPreferenceFromDistance(setup.profile.distanceKm);

  const onboardingUpdate = await supabase
    .from("onboarding_profiles")
    .update({
      age_range: ageRange,
      location_preference: locationPreference,
      intent: nextIntent,
      updated_at: nowIso
    })
    .eq("user_id", user.id)
    .select("user_id")
    .single();

  if (onboardingUpdate.error) {
    return NextResponse.json({ error: "Could not sync onboarding profile fields." }, { status: 500 });
  }

  const finalState = await getUserProfileSetupState(user.id);

  return NextResponse.json(
    {
      completed: true,
      setup: {
        completionPercent: finalState.completionPercent,
        missingRequired: finalState.missingRequired,
        photoCount: finalState.photoCount,
        isComplete: finalState.isComplete
      }
    },
    { status: 200 }
  );
}
