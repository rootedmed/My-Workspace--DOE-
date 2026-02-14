import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const advanceSchema = z.object({
  trackId: z.string().trim().min(1),
  action: z.enum(["complete_reflection", "advance_day", "pause", "resume", "finish"])
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = advanceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const updated = await db.advanceDecisionTrack(parsed.data.trackId, parsed.data.action);
  if (!updated) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  return NextResponse.json(updated, { status: 200 });
}
