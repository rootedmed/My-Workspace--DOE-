import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { toCompatibilityProfileFromRow } from "@/lib/matching/profileParser";
import { computeCompatibility } from "@/lib/compatibility";

const bodySchema = z.object({
  matchId: z.string().uuid()
});

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Validation failed." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const matchRes = await supabase
    .from("mutual_matches")
    .select("id, user_low, user_high")
    .eq("id", body.data.matchId)
    .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
    .maybeSingle();
  if (matchRes.error || !matchRes.data) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const counterpartId =
    String(matchRes.data.user_low) === user.id ? String(matchRes.data.user_high) : String(matchRes.data.user_low);
  const [meRes, counterpartRes] = await Promise.all([
    supabase
      .from("onboarding_profiles")
      .select("user_id, compatibility_profile")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("onboarding_profiles")
      .select("user_id, compatibility_profile")
      .eq("user_id", counterpartId)
      .maybeSingle()
  ]);

  const me = meRes.data ? toCompatibilityProfileFromRow(user.id, meRes.data as Record<string, unknown>) : null;
  const counterpart = counterpartRes.data
    ? toCompatibilityProfileFromRow(counterpartId, counterpartRes.data as Record<string, unknown>)
    : null;
  if (!me || !counterpart) {
    return NextResponse.json({ error: "Compatibility profiles unavailable for snapshot." }, { status: 400 });
  }

  const compatibility = computeCompatibility(me, counterpart);
  const token = crypto.randomBytes(20).toString("hex");
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const snapshotData = {
    score: compatibility.score,
    tier: compatibility.tier,
    dimensionScores: compatibility.dimensionScores,
    notes: compatibility.notes,
    warnings: compatibility.warnings
  };
  const insert = await supabase
    .from("shared_snapshots")
    .insert({
      user_id: user.id,
      match_user_id: counterpartId,
      token,
      snapshot_data: snapshotData,
      expires_at: expiresAt
    })
    .select("id, token, expires_at")
    .single();
  if (insert.error) {
    if (insert.error.code === "42P01") {
      return NextResponse.json({ error: "Snapshot sharing is not migrated yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not create snapshot." }, { status: 500 });
  }
  return NextResponse.json(
    { snapshotId: insert.data.id, token: insert.data.token, expiresAt: insert.data.expires_at, path: `/snapshot/${insert.data.token}` },
    { status: 200 }
  );
}
