import { NextResponse } from "next/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { signOutAccessToken } from "@/lib/auth/supabaseAuth";

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  await signOutAccessToken();
  return NextResponse.json({ ok: true }, { status: 200 });
}
