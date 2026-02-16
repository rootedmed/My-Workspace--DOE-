import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const links = await supabase
    .from("pair_links")
    .select("user_low, user_high")
    .or(`user_low.eq.${user.id},user_high.eq.${user.id}`);

  if (links.error) {
    return NextResponse.json({ error: "Could not load discover candidates." }, { status: 500 });
  }

  const candidateIds = new Set<string>();
  for (const link of links.data ?? []) {
    const low = String(link.user_low);
    const high = String(link.user_high);
    if (low !== user.id) candidateIds.add(low);
    if (high !== user.id) candidateIds.add(high);
  }

  if (candidateIds.size === 0) {
    return NextResponse.json({ candidates: [], emptyReason: "No candidates yet. Invite a friend." }, { status: 200 });
  }

  const profiles = await supabase
    .from("onboarding_profiles")
    .select("user_id, first_name, age_range, location_preference, intent, tendencies, personality, created_at")
    .in("user_id", [...candidateIds]);

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

  return NextResponse.json({ candidates, emptyReason: null }, { status: 200 });
}
