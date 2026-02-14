import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

const stepOneSchema = z.object({
  lookingFor: z.enum(["marriage_minded", "serious_relationship", "exploring"])
});

export async function POST(request: Request) {
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

  await db.saveLookingFor(parsed.data.lookingFor);

  return NextResponse.json(
    {
      saved: true,
      lookingFor: parsed.data.lookingFor
    },
    { status: 200 }
  );
}
