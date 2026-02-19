import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { assertWriteAllowed } from "@/lib/config/env.server";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";
import { getUserProfileSetupState } from "@/lib/profile/setup";

const updateSchema = z.object({
  date_of_birth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  current_city: z.string().trim().min(1).max(120).optional(),
  gender_identity: z.string().trim().min(1).max(80).optional(),
  interested_in: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
  relationship_intention: z
    .enum(["marriage_minded", "serious_relationship", "exploring", "casual", "unsure"])
    .optional(),
  sexual_orientation: z.string().trim().max(80).optional(),
  height_cm: z.number().int().min(120).max(240).nullable().optional(),
  work: z.string().trim().max(120).optional(),
  education: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(280).optional(),
  prompt_answer: z.string().trim().max(280).optional(),
  distance_km: z.number().int().min(1).max(500).nullable().optional(),
  drinking: z.string().trim().max(80).optional(),
  smoking: z.string().trim().max(80).optional(),
  exercise: z.string().trim().max(80).optional(),
  religion: z.string().trim().max(80).optional(),
  politics: z.string().trim().max(80).optional(),
  family_plans: z.string().trim().max(80).optional(),
  pets: z.string().trim().max(80).optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(12).optional()
});

function toNullableString(value: string | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  return value.length > 0 ? value : null;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setup = await getUserProfileSetupState(user.id);

  return NextResponse.json(
    {
      profile: setup.profile,
      setup: {
        completionPercent: setup.completionPercent,
        missingRequired: setup.missingRequired,
        photoCount: setup.photoCount,
        isComplete: setup.isComplete
      }
    },
    { status: 200 }
  );
}

export async function PUT(request: Request) {
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

  await ensureAppUser({
    id: user.id,
    email: user.email,
    firstName: user.firstName
  }).catch(() => undefined);

  const payload = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  if (parsed.data.date_of_birth) {
    const dob = new Date(parsed.data.date_of_birth);
    const now = new Date();
    let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
      age -= 1;
    }
    if (age < 18) {
      return NextResponse.json({ error: "You must be 18+ to use the app." }, { status: 400 });
    }
  }

  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: user.id,
    updated_at: nowIso
  };

  if (parsed.data.date_of_birth !== undefined) row.date_of_birth = parsed.data.date_of_birth;
  if (parsed.data.current_city !== undefined) row.current_city = toNullableString(parsed.data.current_city);
  if (parsed.data.gender_identity !== undefined) row.gender_identity = toNullableString(parsed.data.gender_identity);
  if (parsed.data.interested_in !== undefined) row.interested_in = parsed.data.interested_in;
  if (parsed.data.relationship_intention !== undefined) row.relationship_intention = parsed.data.relationship_intention;
  if (parsed.data.sexual_orientation !== undefined) row.sexual_orientation = toNullableString(parsed.data.sexual_orientation);
  if (parsed.data.height_cm !== undefined) row.height_cm = parsed.data.height_cm;
  if (parsed.data.work !== undefined) row.work = toNullableString(parsed.data.work);
  if (parsed.data.education !== undefined) row.education = toNullableString(parsed.data.education);
  if (parsed.data.bio !== undefined) row.bio = toNullableString(parsed.data.bio);
  if (parsed.data.prompt_answer !== undefined) row.prompt_answer = toNullableString(parsed.data.prompt_answer);
  if (parsed.data.distance_km !== undefined) row.distance_km = parsed.data.distance_km;
  if (parsed.data.drinking !== undefined) row.drinking = toNullableString(parsed.data.drinking);
  if (parsed.data.smoking !== undefined) row.smoking = toNullableString(parsed.data.smoking);
  if (parsed.data.exercise !== undefined) row.exercise = toNullableString(parsed.data.exercise);
  if (parsed.data.religion !== undefined) row.religion = toNullableString(parsed.data.religion);
  if (parsed.data.politics !== undefined) row.politics = toNullableString(parsed.data.politics);
  if (parsed.data.family_plans !== undefined) row.family_plans = toNullableString(parsed.data.family_plans);
  if (parsed.data.pets !== undefined) row.pets = toNullableString(parsed.data.pets);
  if (parsed.data.interests !== undefined) row.interests = parsed.data.interests;

  const upsertRes = await supabase
    .from("user_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select("user_id")
    .single();

  if (upsertRes.error) {
    return NextResponse.json({ error: "Could not save profile." }, { status: 500 });
  }

  const setup = await getUserProfileSetupState(user.id);
  if (setup.profile?.setupCompleted && setup.missingRequired.length > 0) {
    await supabase
      .from("user_profiles")
      .update({ setup_completed: false, setup_completed_at: null, updated_at: nowIso })
      .eq("user_id", user.id);
  }
  return NextResponse.json(
    {
      profile: setup.profile,
      setup: {
        completionPercent: setup.completionPercent,
        missingRequired: setup.missingRequired,
        photoCount: setup.photoCount,
        isComplete: setup.isComplete
      }
    },
    { status: 200 }
  );
}
