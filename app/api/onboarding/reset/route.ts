import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";

function isResetAllowed(request: Request): boolean {
  const url = new URL(request.url);
  return process.env.NODE_ENV !== "production" || url.searchParams.get("dev") === "1";
}

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  if (!isResetAllowed(request)) {
    return NextResponse.json({ error: "Reset disabled." }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  await Promise.all([
    supabase.from("onboarding_drafts").delete().eq("user_id", user.id),
    supabase.from("onboarding_progress").delete().eq("user_id", user.id),
    supabase.from("onboarding_profiles").delete().eq("user_id", user.id),
    supabase.from("user_photos").delete().eq("user_id", user.id)
  ]);

  return NextResponse.json({ ok: true }, { status: 200 });
}
