import { NextResponse } from "next/server";
import { z } from "zod";
import { signInWithPassword } from "@/lib/auth/supabaseAuth";
import { isValidCsrf } from "@/lib/security/csrf";
import { applyRateLimit, getRequestIp } from "@/lib/security/rateLimit";
import { getRequestId, logStructured } from "@/lib/observability/logger";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72)
});

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const ip = getRequestIp(request);
  const limit = applyRateLimit({
    key: `login:${ip}:${parsed.data.email.toLowerCase()}`,
    max: 5,
    windowMs: 10 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  let signedIn;
  try {
    signedIn = await signInWithPassword(parsed.data.email, parsed.data.password);
  } catch {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const firstName =
    signedIn.user.user_metadata?.firstName ??
    signedIn.user.user_metadata?.first_name ??
    signedIn.user.email.split("@")[0] ??
    "Member";
  logStructured("info", "api_user_context", {
    request_id: requestId,
    route: "/api/auth/login",
    user_id: signedIn.user.id
  });

  return NextResponse.json(
    {
      user: {
        id: signedIn.user.id,
        firstName,
        email: signedIn.user.email
      }
    },
    { status: 200 }
  );
}
