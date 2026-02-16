import { getCurrentUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { scoreCompatibility } from "@/lib/matching/compatibility";
import { applyRateLimit, getRequestIp } from "@/lib/security/rateLimit";
import { isPreviewReadOnly } from "@/lib/config/env.server";
import { getRequestId, logStructured } from "@/lib/observability/logger";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(request: Request = new Request("http://localhost/api/matches/preview")) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  logStructured("info", "api_user_context", {
    request_id: requestId,
    route: "/api/matches/preview",
    user_id: user.id
  });

  const userId = user.id;
  const limit = applyRateLimit({
    key: `matches-preview:${getRequestIp(request)}:${userId}`,
    max: 20,
    windowMs: 5 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many match refresh requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const profile = await db.getProfile(userId);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const calibration = await db.getCalibration(userId);
  let candidates = await db.getCandidatePool(userId);

  // Prefer explicit pair-link discovery for deterministic two-user testing.
  try {
    const supabase = await createServerSupabaseClient();
    const linksRes = await supabase
      .from("pair_links")
      .select("user_low, user_high")
      .or(`user_low.eq.${userId},user_high.eq.${userId}`);
    if (!linksRes.error && (linksRes.data?.length ?? 0) > 0) {
      const candidateIds = new Set<string>();
      for (const link of linksRes.data ?? []) {
        const low = String(link.user_low);
        const high = String(link.user_high);
        if (low !== userId) candidateIds.add(low);
        if (high !== userId) candidateIds.add(high);
      }
      if (candidateIds.size > 0) {
        const profileRes = await supabase
          .from("onboarding_profiles")
          .select("user_id, first_name, age_range, location_preference, intent, tendencies, personality, created_at")
          .in("user_id", [...candidateIds]);
        if (!profileRes.error) {
          candidates = (profileRes.data ?? []).map((row) => ({
            id: String(row.user_id),
            firstName: String(row.first_name),
            ageRange: row.age_range,
            locationPreference: row.location_preference,
            intent: row.intent,
            tendencies: row.tendencies,
            personality: row.personality,
            createdAt: String(row.created_at)
          }));
        }
      }
    }
  } catch {
    // Tests can execute this route outside Next request scope.
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { userId, matches: [], emptyReason: "No candidates yet. Invite a friend with a pair code." },
      { status: 200 }
    );
  }
  const matches = candidates
    .map((candidate) => scoreCompatibility(profile, candidate, calibration))
    .filter((match) => match.hardFilterPass)
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, 5);

  if (!isPreviewReadOnly()) {
    await db.saveMatchResults(userId, matches);
  }

  return NextResponse.json({ userId, matches, emptyReason: null }, { status: 200 });
}
