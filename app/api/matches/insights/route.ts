import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeRevealedPreferences } from "@/lib/matching/revealedPreferences";
import { toCompatibilityProfileFromRow } from "@/lib/matching/profileParser";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const [currentProfileRes, outcomesRes] = await Promise.all([
    supabase
      .from("onboarding_profiles")
      .select("user_id, compatibility_profile")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("match_outcomes")
      .select("match_id, did_message, matched_user_id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(100)
  ]);

  if (currentProfileRes.error || outcomesRes.error || !currentProfileRes.data) {
    if (outcomesRes.error?.code === "42P01") {
      return NextResponse.json(
        {
          revealedPreferences: {
            learnedWeights: {
              emotional_openness_preferred: 0,
              conflict_speed_preferred: 0,
              relationship_vision_preferred: [],
              lifestyle_energy_preferred: []
            },
            statedVsRevealed: [],
            sampleSize: 0,
            lastUpdated: new Date().toISOString()
          }
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: "Could not load learning insights." }, { status: 500 });
  }

  const current = toCompatibilityProfileFromRow(user.id, currentProfileRes.data as Record<string, unknown>);
  if (!current) {
    return NextResponse.json({ error: "Compatibility profile not found." }, { status: 400 });
  }

  const counterpartIds = [...new Set((outcomesRes.data ?? []).map((row) => String(row.matched_user_id)))];
  const counterpartProfilesRes =
    counterpartIds.length > 0
      ? await supabase.from("onboarding_profiles").select("user_id, compatibility_profile").in("user_id", counterpartIds)
      : { data: [], error: null };
  if (counterpartProfilesRes.error) {
    return NextResponse.json({ error: "Could not load counterpart profiles." }, { status: 500 });
  }

  const counterpartById = new Map(
    (counterpartProfilesRes.data ?? []).map((row) => {
      const id = String(row.user_id);
      return [id, toCompatibilityProfileFromRow(id, row as Record<string, unknown>)] as const;
    })
  );
  const computed = computeRevealedPreferences(
    current,
    (outcomesRes.data ?? []).map((row) => ({
      did_message: typeof row.did_message === "boolean" ? row.did_message : null,
      candidateProfile: counterpartById.get(String(row.matched_user_id)) ?? null
    }))
  );

  await supabase.from("revealed_preferences").upsert(
    {
      user_id: user.id,
      learned_weights: computed.learnedWeights,
      stated_vs_revealed: computed.statedVsRevealed,
      sample_size: computed.sampleSize,
      last_updated: computed.lastUpdated
    },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ revealedPreferences: computed }, { status: 200 });
}
