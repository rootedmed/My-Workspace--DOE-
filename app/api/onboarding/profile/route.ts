import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase
    .from("onboarding_profiles")
    .select("compatibility_profile, attachment_axis, readiness_score, completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json(
    {
      compatibilityProfile: row?.compatibility_profile ?? null,
      attachmentAxis: row?.attachment_axis ?? null,
      readinessScore: row?.readiness_score ?? null,
      completedAt: row?.completed_at ?? null
    },
    { status: 200 }
  );
}
