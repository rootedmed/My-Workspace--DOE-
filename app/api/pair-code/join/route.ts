import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";
import { isValidCsrf } from "@/lib/security/csrf";
import { orderPairIds } from "@/lib/domain/pairing";

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppUser({ id: user.id, email: user.email, firstName: user.firstName }).catch(() => undefined);

  const body = (await request.json().catch(() => null)) as { code?: string } | null;
  const code = body?.code?.trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ error: "Pair code is required." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const found = await supabase
    .from("pair_codes")
    .select("code, owner_user_id, status")
    .eq("code", code)
    .maybeSingle();

  if (found.error || !found.data) {
    return NextResponse.json({ error: "Pair code not found." }, { status: 404 });
  }

  if (found.data.status !== "active") {
    return NextResponse.json({ error: "Pair code is no longer active." }, { status: 400 });
  }

  if (String(found.data.owner_user_id) === user.id) {
    return NextResponse.json({ error: "You cannot join your own code." }, { status: 400 });
  }

  const pair = orderPairIds(String(found.data.owner_user_id), user.id);

  const [linkRes, updateCodeRes] = await Promise.all([
    supabase
      .from("pair_links")
      .upsert({ user_low: pair.low, user_high: pair.high }, { onConflict: "user_low,user_high" })
      .select("id, user_low, user_high, created_at")
      .single(),
    supabase
      .from("pair_codes")
      .update({ status: "used", used_by_user_id: user.id, used_at: new Date().toISOString() })
      .eq("code", code)
      .select("code, status")
      .single()
  ]);

  if (linkRes.error || updateCodeRes.error || !linkRes.data) {
    return NextResponse.json({ error: "Could not join pair code." }, { status: 500 });
  }

  return NextResponse.json({ pairLink: linkRes.data }, { status: 200 });
}
