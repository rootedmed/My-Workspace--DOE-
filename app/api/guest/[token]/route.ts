import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeGuestCompatibility } from "@/lib/matching/guestCompatibility";
import { toCompatibilityProfileFromRow } from "@/lib/matching/profileParser";

const paramsSchema = z.object({ token: z.string().min(24) });
const bodySchema = z.object({
  past_attribution: z.enum(["misaligned_goals", "conflict_comm", "emotional_disconnect", "autonomy", "external"]),
  conflict_speed: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  love_expression: z.array(z.enum(["acts", "time", "words", "physical", "gifts"])).min(1).max(2),
  support_need: z.enum(["validation", "practical", "presence", "space", "distraction"]),
  emotional_openness: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  relationship_vision: z.enum(["independent", "enmeshed", "friendship", "safe", "adventure"]),
  relational_strengths: z.array(z.enum(["consistency", "loyalty", "honesty", "joy", "support"])).min(1).max(2),
  growth_intention: z.enum(["depth", "balance", "chosen", "peace", "alignment"]),
  lifestyle_energy: z.enum(["introspective", "high_energy", "social", "intellectual", "spontaneous"]).optional()
});

async function loadSession(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, token: string) {
  const nowIso = new Date().toISOString();
  return await supabase
    .from("guest_compatibility_sessions")
    .select("id, host_user_id, host_first_name, host_compatibility_profile, guest_answers, guest_report, expires_at")
    .eq("guest_token", token)
    .gt("expires_at", nowIso)
    .maybeSingle();
}

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid guest token." }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const session = await loadSession(supabase, params.data.token);
  if (session.error || !session.data) {
    return NextResponse.json({ error: "Guest session not found or expired." }, { status: 404 });
  }

  await supabase
    .from("guest_compatibility_sessions")
    .update({ was_viewed: true, viewed_at: new Date().toISOString() })
    .eq("id", session.data.id)
    .catch(() => undefined);

  return NextResponse.json(
    {
      hostFirstName: session.data.host_first_name ? String(session.data.host_first_name) : "your match",
      hasSubmitted: Boolean(session.data.guest_answers),
      report: session.data.guest_report ?? null,
      expiresAt: session.data.expires_at
    },
    { status: 200 }
  );
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid guest token." }, { status: 400 });
  }
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Validation failed." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const session = await loadSession(supabase, params.data.token);
  if (session.error || !session.data) {
    return NextResponse.json({ error: "Guest session not found or expired." }, { status: 404 });
  }

  const hostProfile = toCompatibilityProfileFromRow(String(session.data.host_user_id), {
    compatibility_profile: session.data.host_compatibility_profile ?? null
  });
  if (!hostProfile) {
    return NextResponse.json({ error: "Host compatibility profile not available yet." }, { status: 400 });
  }

  const computed = computeGuestCompatibility(
    hostProfile,
    body.data,
    session.data.host_first_name ? String(session.data.host_first_name) : "your host"
  );

  const updated = await supabase
    .from("guest_compatibility_sessions")
    .update({
      guest_answers: body.data,
      guest_report: computed,
      was_viewed: true,
      viewed_at: new Date().toISOString()
    })
    .eq("id", session.data.id)
    .select("id")
    .single();
  if (updated.error) {
    return NextResponse.json({ error: "Could not save guest compatibility answers." }, { status: 500 });
  }

  return NextResponse.json({ report: computed }, { status: 200 });
}
