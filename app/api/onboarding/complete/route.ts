import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { applyRateLimit, getRequestIp } from "@/lib/security/rateLimit";
import { assertWriteAllowed } from "@/lib/config/env.server";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";
import { getRequestId, logStructured } from "@/lib/observability/logger";
import { deriveAttachmentAxis, deriveReadinessScore } from "@/lib/compatibility";

const payloadSchema = z.object({
  past_attribution: z.enum([
    "misaligned_goals",
    "conflict_comm",
    "emotional_disconnect",
    "autonomy",
    "external"
  ]),
  conflict_speed: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  love_expression: z.array(z.enum(["acts", "time", "words", "physical", "gifts"])).min(1).max(2),
  support_need: z.enum(["validation", "practical", "presence", "space", "distraction"]),
  emotional_openness: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  relationship_vision: z.enum(["independent", "enmeshed", "friendship", "safe", "adventure"]),
  relational_strengths: z.array(z.enum(["consistency", "loyalty", "honesty", "joy", "support"])).min(1).max(2),
  growth_intention: z.enum(["depth", "balance", "chosen", "peace", "alignment"]),
  lifestyle_energy: z.enum(["introspective", "high_energy", "social", "intellectual", "spontaneous"]).optional()
});

export async function POST(request: Request) {
  const requestId = getRequestId(request);

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

  const limit = applyRateLimit({
    key: `onboarding-complete-v2:${getRequestIp(request)}:${user.id}`,
    max: 20,
    windowMs: 10 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many onboarding submissions. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    await ensureAppUser({ id: user.id, email: user.email, firstName: user.firstName });
  } catch (error) {
    return NextResponse.json({ error: "Could not initialize account row.", details: String(error) }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const completedAt = new Date().toISOString();
  const firstName = user.firstName?.trim() || "You";

  const profileBase = {
    userId: user.id,
    ...parsed.data,
    attachment_axis: "secure" as const,
    readiness_score: 0,
    completedAt: new Date(completedAt)
  };
  const attachmentAxis = deriveAttachmentAxis(profileBase);
  const readinessScore = deriveReadinessScore({
    ...profileBase,
    attachment_axis: attachmentAxis
  });

  const compatibilityProfile = {
    ...parsed.data,
    attachment_axis: attachmentAxis,
    readiness_score: readinessScore,
    completedAt
  };

  const timelineMonths =
    parsed.data.relationship_vision === "adventure"
      ? 10
      : parsed.data.relationship_vision === "independent"
        ? 14
        : parsed.data.relationship_vision === "friendship"
          ? 16
          : 20;
  const readiness = Math.max(1, Math.min(5, Math.round(readinessScore / 20)));
  const weeklyCapacity = parsed.data.relationship_vision === "adventure" ? 4 : 3;

  const tendencies = {
    attachmentAnxiety: parsed.data.emotional_openness <= 2 ? 65 : parsed.data.growth_intention === "chosen" ? 70 : 35,
    attachmentAvoidance: parsed.data.emotional_openness >= 4 ? 70 : parsed.data.support_need === "space" ? 65 : 35,
    conflictRepair: parsed.data.conflict_speed <= 2 ? 70 : parsed.data.conflict_speed >= 4 ? 40 : 55,
    emotionalRegulation: parsed.data.conflict_speed >= 4 ? 60 : 50,
    noveltyPreference:
      parsed.data.relationship_vision === "adventure" ? 80 : parsed.data.relationship_vision === "safe" ? 30 : 55
  };
  const personality = {
    openness: parsed.data.relationship_vision === "adventure" ? 75 : 55,
    conscientiousness: parsed.data.relational_strengths.includes("consistency") ? 75 : 55,
    extraversion: parsed.data.love_expression.includes("physical") ? 65 : 50,
    agreeableness: parsed.data.relational_strengths.includes("support") ? 72 : 58,
    emotionalStability: parsed.data.conflict_speed >= 4 ? 65 : 55
  };

  const supabase = await createServerSupabaseClient();
  const upsertRes = await supabase
    .from("onboarding_profiles")
    .upsert(
      {
        user_id: user.id,
        first_name: firstName,
        age_range: "31_37",
        location_preference: "same_city",
        intent: {
          lookingFor: "serious_relationship",
          timelineMonths,
          readiness,
          weeklyCapacity
        },
        tendencies,
        personality,
        compatibility_profile: compatibilityProfile,
        attachment_axis: attachmentAxis,
        readiness_score: readinessScore,
        completed_at: completedAt,
        updated_at: completedAt
      },
      { onConflict: "user_id" }
    )
    .select("user_id")
    .single();

  if (upsertRes.error) {
    logStructured("error", "supabase_write", {
      request_id: requestId,
      operation: "upsert",
      table: "onboarding_profiles",
      user_id: user.id,
      status: "error",
      error_code: upsertRes.error.code ?? null,
      error_message: upsertRes.error.message ?? null,
      error_details: upsertRes.error.details ?? null
    });
    return NextResponse.json({ error: "Could not persist onboarding profile." }, { status: 500 });
  }

  const progressRes = await supabase
    .from("onboarding_progress")
    .upsert(
      {
        user_id: user.id,
        current_step: 9,
        completed: true,
        total_steps: 9,
        mode: "deep",
        updated_at: completedAt
      },
      { onConflict: "user_id" }
    )
    .select("current_step, completed, total_steps, mode")
    .single();

  if (progressRes.error || !progressRes.data) {
    return NextResponse.json({ error: "Could not finalize onboarding progress." }, { status: 500 });
  }

  return NextResponse.json(
    {
      profile: compatibilityProfile,
      progress: progressRes.data
    },
    { status: 200 }
  );
}
