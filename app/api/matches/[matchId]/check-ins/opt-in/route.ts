import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";

const paramsSchema = z.object({ matchId: z.string().uuid() });
const bodySchema = z.object({ optIn: z.boolean() });

async function getAuthorizedMatch(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, matchId: string, userId: string) {
  const res = await supabase
    .from("mutual_matches")
    .select("id")
    .eq("id", matchId)
    .or(`user_low.eq.${userId},user_high.eq.${userId}`)
    .maybeSingle();
  return res.data ?? null;
}

export async function POST(request: Request, context: { params: Promise<{ matchId: string }> }) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Validation failed." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const match = await getAuthorizedMatch(supabase, params.data.matchId, user.id);
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const write = await supabase
    .from("relationship_checkin_opt_ins")
    .upsert(
      {
        match_id: params.data.matchId,
        user_id: user.id,
        opted_in: body.data.optIn,
        updated_at: new Date().toISOString()
      },
      { onConflict: "match_id,user_id" }
    )
    .select("match_id, user_id, opted_in, updated_at")
    .single();

  if (write.error) {
    if (write.error.code === "42P01") {
      return NextResponse.json({ error: "Check-ins are not migrated yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not update check-in preferences." }, { status: 500 });
  }
  return NextResponse.json({ optIn: write.data }, { status: 200 });
}
