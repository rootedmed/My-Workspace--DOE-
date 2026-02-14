import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export async function GET() {
  const dbStatus = await db.ping();
  const stats = await db.getStats();

  return NextResponse.json(
    {
      status: "ok",
      service: "commitment-match-mvp",
      db: dbStatus,
      stats
    },
    { status: 200 }
  );
}
