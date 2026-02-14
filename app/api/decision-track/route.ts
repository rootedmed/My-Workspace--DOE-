import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { buildDecisionTrack, decisionTrackRequestSchema } from "@/lib/validation/decisionTrack";

export async function POST(request: Request) {
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
  await db.incrementGeneratedTracks();

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
