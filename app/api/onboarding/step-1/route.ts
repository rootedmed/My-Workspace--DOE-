import { getCurrentUser } from "@/lib/auth/session";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { isValidCsrf } from "@/lib/security/csrf";
import { assertWriteAllowed } from "@/lib/config/env.server";
import { getRequestId, logStructured } from "@/lib/observability/logger";

const stepOneSchema = z.object({
  lookingFor: z.enum(["marriage_minded", "serious_relationship", "exploring"])
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
    route: "/api/onboarding/step-1",
    user_id: user.id
  });

  const body = await request.json().catch(() => null);
  const parsed = stepOneSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  await db.saveLookingFor(user.id, parsed.data.lookingFor);

  return NextResponse.json(
    {
      saved: true,
      lookingFor: parsed.data.lookingFor
    },
    { status: 200 }
  );
}
