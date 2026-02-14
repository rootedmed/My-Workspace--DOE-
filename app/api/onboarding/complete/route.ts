import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { scorePersonality, scoreTendencies, summarizeTendencies } from "@/lib/psychology/scoring";
import { onboardingSchema } from "@/lib/validation/onboarding";

export async function POST(request: Request) {
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

  const profile = await db.saveProfile({
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
