import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidCsrf } from "@/lib/security/csrf";
import { db } from "@/lib/db/client";
import { applyRateLimit, getRequestIp } from "@/lib/security/rateLimit";
import { assertWriteAllowed } from "@/lib/config/env.server";
import { getRequestId, logStructured } from "@/lib/observability/logger";
import { signUpWithPassword } from "@/lib/auth/supabaseAuth";

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(40),
  email: z.string().trim().email(),
  password: z.string().min(8).max(72)
});

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    assertWriteAllowed();
  } catch {
    return NextResponse.json({ error: "Preview is read-only." }, { status: 503 });
  }

  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const limit = applyRateLimit({
    key: `register:${ip}:${parsed.data.email.toLowerCase()}`,
    max: 5,
    windowMs: 10 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const signUp = await signUpWithPassword(
      parsed.data.email.toLowerCase(),
      parsed.data.password,
      parsed.data.firstName
    );
    if (!signUp.user?.id || !signUp.user.email || !signUp.sessionActive) {
      return NextResponse.json(
        {
          error:
            "Account created. Please verify your email before signing in."
        },
        { status: 200 }
      );
    }

    await db
      .upsertAuthUser({
        id: signUp.user.id,
        email: signUp.user.email,
        firstName: parsed.data.firstName
      })
      .catch(() => null);

    logStructured("info", "api_user_context", {
      request_id: requestId,
      route: "/api/auth/register",
      user_id: signUp.user.id
    });
    return NextResponse.json(
      {
        user: {
          id: signUp.user.id,
          firstName: parsed.data.firstName,
          email: signUp.user.email
        }
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to register";
    const safeMessage = message === "Email already exists" ? message : "Unable to register";
    return NextResponse.json({ error: safeMessage }, { status: 400 });
  }
}
