import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { captureObservedError } from "@/lib/observability/errorReporter";
import { getRequestId, logStructured } from "@/lib/observability/logger";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  try {
    const dbStatus = await db.ping();
    logStructured("info", "health_check", {
      request_id: requestId,
      route: "/api/health",
      db: dbStatus
    });

    return NextResponse.json(
      {
        status: "ok",
        service: "commitment-match-mvp",
        app: "ok",
        db: dbStatus
      },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (error) {
    captureObservedError(error, {
      source: "server",
      requestId,
      route: "/api/health"
    });
    return NextResponse.json(
      {
        status: "error",
        service: "commitment-match-mvp",
        app: "ok",
        db: "error"
      },
      { status: 503, headers: { "x-request-id": requestId } }
    );
  }
}
