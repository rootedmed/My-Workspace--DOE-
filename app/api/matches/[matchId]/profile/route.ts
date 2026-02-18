import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { toCompatibilityProfileFromRow } from "@/lib/matching/profileParser";
import { computeCompatibility } from "@/lib/compatibility";
import { generateIncompatibilityReport } from "@/lib/matching/incompatibilityReport";

const paramsSchema = z.object({
  matchId: z.string().uuid()
});

function toReportProfile(profile: ReturnType<typeof toCompatibilityProfileFromRow>) {
  if (!profile) return null;
  return {
    conflict_speed: profile.conflict_speed,
    emotional_openness: profile.emotional_openness,
    support_need: profile.support_need,
    relationship_vision: profile.relationship_vision
  };
}

async function loadAuthorizedMatch(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, matchId: string, userId: string) {
  const matchRes = await supabase
    .from("mutual_matches")
    .select("id, user_low, user_high, created_at")
    .eq("id", matchId)
    .or(`user_low.eq.${userId},user_high.eq.${userId}`)
    .maybeSingle();

  if (matchRes.error || !matchRes.data) return null;
  return matchRes.data;
}

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const match = await loadAuthorizedMatch(supabase, parsedParams.data.matchId, user.id);
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const counterpartId = String(match.user_low) === user.id ? String(match.user_high) : String(match.user_low);
  const [counterpartProfileRes, currentProfileRes, photoRes, optInRes, checkinRes] = await Promise.all([
    supabase
      .from("onboarding_profiles")
      .select("user_id, first_name, compatibility_profile")
      .eq("user_id", counterpartId)
      .maybeSingle(),
    supabase
      .from("onboarding_profiles")
      .select("user_id, compatibility_profile")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_photos")
      .select("storage_path, mime_type, image_base64")
      .eq("user_id", counterpartId)
      .eq("slot", 1)
      .maybeSingle(),
    supabase
      .from("relationship_checkin_opt_ins")
      .select("user_id, opted_in")
      .eq("match_id", parsedParams.data.matchId),
    supabase
      .from("relationship_checkins")
      .select("month_number, user_low, user_high, user_low_responses, user_high_responses")
      .eq("match_id", parsedParams.data.matchId)
      .order("month_number", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (counterpartProfileRes.error || currentProfileRes.error || photoRes.error || optInRes.error || checkinRes.error) {
    return NextResponse.json({ error: "Could not load match profile." }, { status: 500 });
  }

  const currentCompatibility = currentProfileRes.data
    ? toCompatibilityProfileFromRow(user.id, currentProfileRes.data as Record<string, unknown>)
    : null;
  const counterpartCompatibility = counterpartProfileRes.data
    ? toCompatibilityProfileFromRow(counterpartId, counterpartProfileRes.data as Record<string, unknown>)
    : null;
  const compatibility =
    currentCompatibility && counterpartCompatibility
      ? computeCompatibility(currentCompatibility, counterpartCompatibility)
      : null;
  const coaching =
    currentCompatibility && counterpartCompatibility && counterpartProfileRes.data?.first_name
      ? generateIncompatibilityReport(
          toReportProfile(currentCompatibility),
          toReportProfile(counterpartCompatibility),
          String(counterpartProfileRes.data.first_name),
          compatibility?.score ?? 0
        )
      : null;

  const optRows = optInRes.data ?? [];
  const allOptedIn = optRows.length >= 2 && optRows.every((row) => row.opted_in === true);
  const myOptIn = optRows.some((row) => String(row.user_id) === user.id && row.opted_in);
  const lowId = String(match.user_low);
  const latest = checkinRes.data;
  const yourResponses =
    user.id === lowId ? latest?.user_low_responses ?? null : latest?.user_high_responses ?? null;
  const partnerResponses =
    user.id === lowId ? latest?.user_high_responses ?? null : latest?.user_low_responses ?? null;

  let counterpartPhotoUrl: string | null = null;
  if (photoRes.data?.storage_path) {
    const signed = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(String(photoRes.data.storage_path), 60 * 60);
    if (!signed.error && signed.data?.signedUrl) {
      counterpartPhotoUrl = signed.data.signedUrl;
    }
  }
  if (!counterpartPhotoUrl && photoRes.data?.image_base64) {
    const mime = photoRes.data?.mime_type ?? "image/jpeg";
    counterpartPhotoUrl = `data:${mime};base64,${photoRes.data.image_base64}`;
  }

  return NextResponse.json(
    {
      match: {
        id: String(match.id),
        counterpartId,
        counterpartFirstName: counterpartProfileRes.data?.first_name
          ? String(counterpartProfileRes.data.first_name)
          : "Match",
        counterpartPhotoUrl,
        createdAt: String(match.created_at)
      },
      compatibilitySnapshot: compatibility,
      coaching,
      checkIn: {
        enabled: allOptedIn,
        myOptIn,
        latestMonth: latest?.month_number ?? null,
        yourResponses,
        partnerResponses
      }
    },
    { status: 200 }
  );
}
