import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const startSchema = z.object({
  userId: z.string().trim().min(1)
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = startSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const profile = await db.getProfile(parsed.data.userId);
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const result = await db.createDecisionTrack(parsed.data.userId);
  return NextResponse.json(result, { status: 200 });
}
