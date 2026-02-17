import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const profiles = await supabase
    .from("onboarding_profiles")
    .select("user_id, first_name, age_range, location_preference, intent, tendencies, personality, created_at")
    .neq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (profiles.error) {
    return NextResponse.json({ error: "Could not load candidate profiles." }, { status: 500 });
  }

  const candidates = (profiles.data ?? []).map((row) => ({
    id: String(row.user_id),
    firstName: String(row.first_name),
    ageRange: row.age_range,
    locationPreference: row.location_preference,
    intent: row.intent,
    tendencies: row.tendencies,
    personality: row.personality,
    createdAt: String(row.created_at)
  }));

  if (candidates.length === 0) {
    return NextResponse.json({ candidates: [], emptyReason: "No candidates available yet." }, { status: 200 });
  }

  return NextResponse.json({ candidates, emptyReason: null }, { status: 200 });
}
