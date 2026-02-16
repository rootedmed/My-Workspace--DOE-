import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { orderPairIds } from "@/lib/domain/pairing";
import { promptForDay, topicSuggestions } from "@/lib/domain/guidedPrompts";

async function getOrCreateConversation(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, left: string, right: string) {
  const pair = orderPairIds(left, right);
  const existing = await supabase
    .from("conversations")
    .select("id, user_low, user_high, created_at, updated_at")
    .eq("user_low", pair.low)
    .eq("user_high", pair.high)
    .maybeSingle();

  if (existing.data) {
    return existing.data;
  }

  const inserted = await supabase
    .from("conversations")
    .insert({ user_low: pair.low, user_high: pair.high, updated_at: new Date().toISOString() })
    .select("id, user_low, user_high, created_at, updated_at")
    .single();

  return inserted.data;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const participantId = url.searchParams.get("participantId");
  if (!participantId) {
    return NextResponse.json({ error: "participantId is required" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const conversation = await getOrCreateConversation(supabase, user.id, participantId);
  if (!conversation?.id) {
    return NextResponse.json({ error: "Could not initialize conversation" }, { status: 500 });
  }

  const [messagesRes, trackRes] = await Promise.all([
    supabase
      .from("messages")
      .select("id, sender_id, body, type, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("conversation_decision_tracks")
      .select("day_number, status, prompt_id, completed_at, notes, updated_at")
      .eq("conversation_id", conversation.id)
      .maybeSingle()
  ]);

  if (messagesRes.error || trackRes.error) {
    return NextResponse.json({ error: "Could not load conversation." }, { status: 500 });
  }

  return NextResponse.json(
    {
      conversation,
      messages: messagesRes.data ?? [],
      decisionTrack:
        trackRes.data ??
        ({ day_number: 1, status: "pending", prompt_id: "day_1", completed_at: null, notes: null } as const),
      suggestedTopics: topicSuggestions().slice(0, 3)
    },
    { status: 200 }
  );
}

const postSchema = z.object({
  participantId: z.string().uuid(),
  action: z.enum(["send_message", "send_topic", "start_day", "complete_day"]),
  body: z.string().trim().min(1).max(1500).optional()
});

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const conversation = await getOrCreateConversation(supabase, user.id, parsed.data.participantId);
  if (!conversation?.id) {
    return NextResponse.json({ error: "Could not initialize conversation" }, { status: 500 });
  }

  if (parsed.data.action === "send_message" || parsed.data.action === "send_topic") {
    const insert = await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      body: parsed.data.body ?? "",
      type: parsed.data.action === "send_topic" ? "suggested_topic" : "message"
    });

    if (insert.error) {
      return NextResponse.json({ error: "Could not send message." }, { status: 500 });
    }
  }

  if (parsed.data.action === "start_day") {
    const current = await supabase
      .from("conversation_decision_tracks")
      .select("day_number")
      .eq("conversation_id", conversation.id)
      .maybeSingle();

    const day = current.data?.day_number ? Number(current.data.day_number) : 1;

    await supabase.from("conversation_decision_tracks").upsert(
      {
        conversation_id: conversation.id,
        day_number: day,
        status: "in_progress",
        prompt_id: `day_${day}`,
        updated_at: new Date().toISOString()
      },
      { onConflict: "conversation_id" }
    );

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      body: promptForDay(day),
      type: "decision_prompt"
    });
  }

  if (parsed.data.action === "complete_day") {
    const current = await supabase
      .from("conversation_decision_tracks")
      .select("day_number")
      .eq("conversation_id", conversation.id)
      .maybeSingle();

    const day = current.data?.day_number ? Number(current.data.day_number) : 1;
    const nextDay = Math.min(14, day + 1);

    await supabase.from("conversation_decision_tracks").upsert(
      {
        conversation_id: conversation.id,
        day_number: nextDay,
        status: nextDay > day ? "pending" : "completed",
        prompt_id: `day_${nextDay}`,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "conversation_id" }
    );

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      sender_id: user.id,
      body: `Completed Day ${day}.`,
      type: "decision_complete"
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
