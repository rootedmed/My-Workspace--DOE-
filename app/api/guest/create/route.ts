import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const hostProfile = await supabase
    .from("onboarding_profiles")
    .select("first_name, compatibility_profile")
    .eq("user_id", user.id)
    .maybeSingle();
  if (hostProfile.error || !hostProfile.data?.compatibility_profile) {
    return NextResponse.json({ error: "Complete onboarding before creating guest links." }, { status: 400 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const recent = await supabase
    .from("guest_compatibility_sessions")
    .select("id")
    .eq("host_user_id", user.id)
    .gte("created_at", thirtyDaysAgo);
  if (recent.error && recent.error.code !== "42P01") {
    return NextResponse.json({ error: "Could not create guest link." }, { status: 500 });
  }
  if ((recent.data ?? []).length >= 3) {
    return NextResponse.json({ error: "Guest compatibility limit reached for this month." }, { status: 429 });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const insert = await supabase
    .from("guest_compatibility_sessions")
    .insert({
      host_user_id: user.id,
      host_first_name: hostProfile.data.first_name ? String(hostProfile.data.first_name) : user.firstName ?? "Host",
      host_compatibility_profile: hostProfile.data.compatibility_profile,
      guest_token: token,
      expires_at: expiresAt
    })
    .select("id, guest_token, expires_at")
    .single();

  if (insert.error) {
    if (insert.error.code === "42P01") {
      return NextResponse.json({ error: "Guest compatibility is not migrated yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not create guest link." }, { status: 500 });
  }
  return NextResponse.json(
    {
      sessionId: insert.data.id,
      token: insert.data.guest_token,
      expiresAt: insert.data.expires_at,
      path: `/guest/${insert.data.guest_token}`
    },
    { status: 200 }
  );
}
