import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { summarizeTendencies } from "@/lib/psychology/scoring";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db.getProfile(user.id);
  if (!profile) {
    return NextResponse.json({ profile: null, tendenciesSummary: [] as string[] }, { status: 200 });
  }

  return NextResponse.json(
    {
      profile,
      tendenciesSummary: summarizeTendencies(profile.tendencies)
    },
    { status: 200 }
  );
}
