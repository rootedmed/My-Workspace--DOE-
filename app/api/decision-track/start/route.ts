import { getCurrentUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { isValidCsrf } from "@/lib/security/csrf";
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
    route: "/api/decision-track/start",
    user_id: user.id
  });
  await request.json().catch(() => null);

  const profile = await db.getProfile(user.id);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const result = await db.createDecisionTrack(user.id);
  return NextResponse.json(result, { status: 200 });
}
