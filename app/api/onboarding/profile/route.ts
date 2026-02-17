import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { summarizeTendencies } from "@/lib/psychology/scoring";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: v2Row } = await supabase
    .from("onboarding_profiles")
    .select("compatibility_profile, attachment_axis, readiness_score, completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = await db.getProfile(user.id);
  if (!profile) {
    return NextResponse.json(
      {
        profile: null,
        tendenciesSummary: [] as string[],
        compatibilityProfile: v2Row?.compatibility_profile ?? null,
        completedAt: v2Row?.completed_at ?? null
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      profile,
      tendenciesSummary: summarizeTendencies(profile.tendencies),
      compatibilityProfile: v2Row?.compatibility_profile ?? null,
      completedAt: v2Row?.completed_at ?? null
    },
    { status: 200 }
  );
}
