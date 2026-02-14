import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createCsrfToken, CSRF_COOKIE } from "@/lib/security/csrf";

export async function GET() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(CSRF_COOKIE)?.value;
  const token = existing ?? createCsrfToken();

  if (!existing) {
    cookieStore.set(CSRF_COOKIE, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7
    });
  }

  return NextResponse.json({ csrfToken: token }, { status: 200 });
}
