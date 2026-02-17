import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";

const paramsSchema = z.object({ matchId: z.string().uuid() });
const bodySchema = z.object({
  monthNumber: z.number().int().min(1).optional(),
  responses: z.object({
    connection: z.number().int().min(1).max(5),
    conflictHandling: z.number().int().min(1).max(5),
    growth: z.number().int().min(1).max(5)
  })
});

async function getAuthorizedMatch(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, matchId: string, userId: string) {
  const res = await supabase
    .from("mutual_matches")
    .select("id, user_low, user_high, created_at")
    .eq("id", matchId)
    .or(`user_low.eq.${userId},user_high.eq.${userId}`)
    .maybeSingle();
  return res.data ?? null;
}

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const match = await getAuthorizedMatch(supabase, params.data.matchId, user.id);
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const [optInRes, checkinRes] = await Promise.all([
    supabase
      .from("relationship_checkin_opt_ins")
      .select("user_id, opted_in")
      .eq("match_id", params.data.matchId),
    supabase
      .from("relationship_checkins")
      .select(
        "id, month_number, user_low, user_high, user_low_responses, user_low_submitted_at, user_high_responses, user_high_submitted_at, updated_at"
      )
      .eq("match_id", params.data.matchId)
      .order("month_number", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (optInRes.error || checkinRes.error) {
    if (optInRes.error?.code === "42P01" || checkinRes.error?.code === "42P01") {
      return NextResponse.json({ enabled: false, checkIn: null }, { status: 200 });
    }
    return NextResponse.json({ error: "Could not load check-ins." }, { status: 500 });
  }

  const rows = optInRes.data ?? [];
  const allOptedIn = rows.length >= 2 && rows.every((row) => row.opted_in === true);
  const currentRow = rows.find((row) => String(row.user_id) === user.id);
  const latest = checkinRes.data;
  const lowId = String(match.user_low);
  const yourResponses =
    user.id === lowId ? (latest?.user_low_responses ?? null) : (latest?.user_high_responses ?? null);
  const partnerResponses =
    user.id === lowId ? (latest?.user_high_responses ?? null) : (latest?.user_low_responses ?? null);
  let coachingScript: string | null = null;

  const yourConnection = typeof yourResponses?.connection === "number" ? yourResponses.connection : null;
  const partnerConnection = typeof partnerResponses?.connection === "number" ? partnerResponses.connection : null;
  if (yourConnection !== null && partnerConnection !== null && Math.abs(yourConnection - partnerConnection) >= 2) {
    coachingScript = `Hey, I want to check in. I've been feeling ${
      yourConnection <= 2 ? "disconnected" : "really connected"
    } lately. How are you feeling about us?`;
  }

  return NextResponse.json(
    {
      enabled: allOptedIn,
      myOptIn: currentRow?.opted_in ?? false,
      checkIn: latest
        ? {
            monthNumber: latest.month_number,
            yourResponses,
            partnerResponses,
            coachingScript
          }
        : null
    },
    { status: 200 }
  );
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

  const optIns = await supabase
    .from("relationship_checkin_opt_ins")
    .select("user_id, opted_in")
    .eq("match_id", params.data.matchId);
  if (optIns.error) {
    if (optIns.error.code === "42P01") {
      return NextResponse.json({ error: "Check-ins are not migrated yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not validate check-in status." }, { status: 500 });
  }
  const allOptedIn = (optIns.data ?? []).length >= 2 && (optIns.data ?? []).every((row) => row.opted_in === true);
  if (!allOptedIn) {
    return NextResponse.json({ error: "Both users must opt in first." }, { status: 400 });
  }

  const createdAt = Date.parse(String(match.created_at));
  const derivedMonth = Number.isFinite(createdAt)
    ? Math.max(1, Math.floor((Date.now() - createdAt) / (30 * 24 * 60 * 60 * 1000)) + 1)
    : 1;
  const monthNumber = body.data.monthNumber ?? derivedMonth;
  const lowId = String(match.user_low);
  const highId = String(match.user_high);
  const updatePayload =
    user.id === lowId
      ? {
          user_low_responses: body.data.responses,
          user_low_submitted_at: new Date().toISOString()
        }
      : {
          user_high_responses: body.data.responses,
          user_high_submitted_at: new Date().toISOString()
        };

  const existing = await supabase
    .from("relationship_checkins")
    .select("id")
    .eq("match_id", params.data.matchId)
    .eq("month_number", monthNumber)
    .maybeSingle();
  if (existing.error && existing.error.code !== "PGRST116") {
    return NextResponse.json({ error: "Could not save check-in." }, { status: 500 });
  }

  const row = existing.data
    ? await supabase
        .from("relationship_checkins")
        .update({ ...updatePayload, updated_at: new Date().toISOString() })
        .eq("id", String(existing.data.id))
        .select("id, month_number, updated_at")
        .single()
    : await supabase
        .from("relationship_checkins")
        .insert({
          match_id: params.data.matchId,
          user_low: lowId,
          user_high: highId,
          month_number: monthNumber,
          ...updatePayload,
          updated_at: new Date().toISOString()
        })
        .select("id, month_number, updated_at")
        .single();

  if (row.error || !row.data) {
    return NextResponse.json({ error: "Could not save check-in." }, { status: 500 });
  }
  return NextResponse.json({ checkIn: row.data }, { status: 200 });
}
