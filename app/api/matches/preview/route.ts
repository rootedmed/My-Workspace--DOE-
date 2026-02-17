import { getCurrentUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { scoreCompatibility } from "@/lib/matching/compatibility";
import { applyRateLimit, getRequestIp } from "@/lib/security/rateLimit";
import { isPreviewReadOnly } from "@/lib/config/env.server";
import { getRequestId, logStructured } from "@/lib/observability/logger";

export async function GET(request: Request = new Request("http://localhost/api/matches/preview")) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  logStructured("info", "api_user_context", {
    request_id: requestId,
    route: "/api/matches/preview",
    user_id: user.id
  });

  const userId = user.id;
  const limit = applyRateLimit({
    key: `matches-preview:${getRequestIp(request)}:${userId}`,
    max: 20,
    windowMs: 5 * 60 * 1000
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many match refresh requests. Please wait and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const profile = await db.getProfile(userId);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const calibration = await db.getCalibration(userId);
  const candidates = await db.getCandidatePool(userId);

  if (candidates.length === 0) {
    return NextResponse.json(
      { userId, matches: [], emptyReason: "No candidates available yet." },
      { status: 200 }
    );
  }
  const matches = candidates
    .map((candidate) => scoreCompatibility(profile, candidate, calibration))
    .filter((match) => match.hardFilterPass)
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, 5);

  if (!isPreviewReadOnly()) {
    await db.saveMatchResults(userId, matches);
  }

  return NextResponse.json({ userId, matches, emptyReason: null }, { status: 200 });
}
