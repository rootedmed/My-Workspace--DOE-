import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { scorePersonality, scoreTendencies, summarizeTendencies } from "@/lib/psychology/scoring";
import { onboardingSchema } from "@/lib/validation/onboarding";
import { isValidCsrf } from "@/lib/security/csrf";
import { applyRateLimit, getRequestIp } from "@/lib/security/rateLimit";
import { assertWriteAllowed } from "@/lib/config/env.server";
import { getRequestId, logStructured } from "@/lib/observability/logger";

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

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  logStructured("info", "api_user_context", {
    request_id: requestId,
    route: "/api/onboarding/complete",
    user_id: user.id
  });

  const limit = applyRateLimit({
    key: `onboarding-complete:${getRequestIp(request)}:${user.id}`,
    max: 12,
    windowMs: 10 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many onboarding submissions. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const upserted = await db
    .upsertAuthUser({
      id: user.id,
      email: user.email ?? `${user.id}@local.invalid`,
      firstName: user.firstName ?? "Member"
    })
    .catch(() => null);
  if (!upserted) {
    return NextResponse.json({ error: "Could not initialize your account profile." }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = onboardingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tendencies = scoreTendencies(parsed.data);
  const personality = scorePersonality(parsed.data);

  const profile = await db.saveProfile(user.id, {
    firstName: parsed.data.firstName,
    ageRange: parsed.data.ageRange,
    locationPreference: parsed.data.locationPreference,
    intent: {
      lookingFor: parsed.data.lookingFor,
      timelineMonths: parsed.data.timelineMonths,
      readiness: parsed.data.readiness,
      weeklyCapacity: parsed.data.weeklyCapacity
    },
    tendencies,
    personality
  });

  return NextResponse.json(
    {
      profile,
      tendenciesSummary: summarizeTendencies(tendencies)
    },
    { status: 200 }
  );
}
