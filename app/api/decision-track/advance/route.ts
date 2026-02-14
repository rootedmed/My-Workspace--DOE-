import { getCurrentUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { isValidCsrf } from "@/lib/security/csrf";
import { assertWriteAllowed } from "@/lib/config/env.server";
import { getRequestId, logStructured } from "@/lib/observability/logger";

const advanceSchema = z.object({
  trackId: z.string().trim().min(1),
  action: z.enum(["complete_reflection", "advance_day", "pause", "resume", "finish"])
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

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  logStructured("info", "api_user_context", {
    request_id: requestId,
    route: "/api/decision-track/advance",
    user_id: user.id
  });

  const body = await request.json().catch(() => null);
  const parsed = advanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const track = await db.getTrackById(parsed.data.trackId);
  if (!track || track.userId !== user.id) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const updated = await db.advanceDecisionTrack(parsed.data.trackId, parsed.data.action);
  if (!updated) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  return NextResponse.json(updated, { status: 200 });
}
