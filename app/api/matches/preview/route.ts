import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { scoreCompatibility } from "@/lib/matching/compatibility";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const profile = await db.getProfile(userId);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const candidates = await db.getCandidatePool(userId);
  const matches = candidates
    .map((candidate) => scoreCompatibility(profile, candidate))
    .filter((match) => match.hardFilterPass)
    .sort((left, right) => right.totalScore - left.totalScore)
    .slice(0, 5);

  return NextResponse.json({ userId, matches }, { status: 200 });
}
