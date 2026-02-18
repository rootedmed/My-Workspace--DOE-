import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { isUxTelemetryEnabled } from "@/lib/config/uiFlags";
import { getRequestId, logStructured } from "@/lib/observability/logger";

const primitiveSchema = z.union([z.string().max(180), z.number(), z.boolean(), z.null()]);

const bodySchema = z.object({
  event: z.string().trim().min(1).max(120),
  path: z.string().trim().max(240).optional(),
  timestamp: z.string().trim().max(64).optional(),
  context: z.record(z.string().min(1).max(60), primitiveSchema).optional()
});

function contextToFields(context?: Record<string, string | number | boolean | null>) {
  const output: Record<string, string | number | boolean | null> = {};
  if (!context) return output;

  const entries = Object.entries(context).slice(0, 16);
  for (const [key, value] of entries) {
    output[`ux_${key}`] = value;
  }
  return output;
}

export async function POST(request: Request) {
  if (!isUxTelemetryEnabled()) {
    return new NextResponse(null, { status: 204 });
  }

  const requestId = getRequestId(request);
  const payload = bodySchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: "Invalid telemetry payload." }, { status: 400 });
  }

  const user = await getCurrentUser().catch(() => null);
  const fields = contextToFields(payload.data.context);

  logStructured("info", "ux_event", {
    request_id: requestId,
    route: "/api/telemetry/ux",
    user_id: user?.id ?? null,
    event_name: payload.data.event,
    page_path: payload.data.path ?? null,
    client_timestamp: payload.data.timestamp ?? null,
    ...fields
  });

  return new NextResponse(null, { status: 202 });
}
