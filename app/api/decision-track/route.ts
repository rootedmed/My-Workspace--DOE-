import { NextResponse } from "next/server";
import { buildDecisionTrack, decisionTrackRequestSchema } from "@/lib/validation/decisionTrack";
import { isValidCsrf } from "@/lib/security/csrf";

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = decisionTrackRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten()
      },
      { status: 400 }
    );
  }

  const track = buildDecisionTrack(parsed.data);
  return NextResponse.json(
    {
      profile: {
        firstName: parsed.data.firstName,
        commitmentGoal: parsed.data.commitmentGoal,
        weeklyDateCapacity: parsed.data.weeklyDateCapacity,
        decisionPace: parsed.data.decisionPace,
        reflectionTrait: parsed.data.reflectionTrait
      },
      track
    },
    { status: 200 }
  );
}
