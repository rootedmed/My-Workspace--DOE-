import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";
import { isValidCsrf } from "@/lib/security/csrf";

function randomCode(length = 7): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppUser({ id: user.id, email: user.email, firstName: user.firstName }).catch(() => undefined);

  const supabase = await createServerSupabaseClient();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = randomCode();
    const insert = await supabase
      .from("pair_codes")
      .insert({ code, owner_user_id: user.id, status: "active" })
      .select("code, status, created_at")
      .single();

    if (!insert.error && insert.data) {
      return NextResponse.json({ pairCode: insert.data }, { status: 200 });
    }
  }

  return NextResponse.json({ error: "Could not create pair code." }, { status: 500 });
}
