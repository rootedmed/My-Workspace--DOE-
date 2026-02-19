import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { recordMatchView, recordMessageOutcome } from "@/lib/matching/outcomes";
import { toCompatibilityProfileFromRow } from "@/lib/matching/profileParser";
import { computeCompatibility } from "@/lib/compatibility";

const paramsSchema = z.object({
  matchId: z.string().uuid()
});

const postSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

async function loadAuthorizedMatch(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, matchId: string, userId: string) {
  const matchRes = await supabase
    .from("mutual_matches")
    .select("id, user_low, user_high, created_at")
    .eq("id", matchId)
    .or(`user_low.eq.${userId},user_high.eq.${userId}`)
    .maybeSingle();

  if (matchRes.error || !matchRes.data) {
    return null;
  }

  return matchRes.data;
}

export async function GET(_request: Request, context: { params: Promise<{ matchId: string }> }) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const match = await loadAuthorizedMatch(supabase, parsedParams.data.matchId, user.id);
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }

  const counterpartId = String(match.user_low) === user.id ? String(match.user_high) : String(match.user_low);
  await recordMatchView(supabase, {
    matchId: parsedParams.data.matchId,
    userId: user.id,
    matchedUserId: counterpartId
  }).catch(() => undefined);
  const [messagesRes, profileRes, photoRes, currentProfileRes] = await Promise.all([
    supabase
      .from("match_messages")
      .select("id, match_id, sender_id, body, created_at")
      .eq("match_id", parsedParams.data.matchId)
      .order("created_at", { ascending: true }),
    supabase
      .from("onboarding_profiles")
      .select("first_name, compatibility_profile")
      .eq("user_id", counterpartId)
      .maybeSingle(),
    supabase
      .from("user_photos")
      .select("storage_path, mime_type, image_base64, display_order")
      .eq("user_id", counterpartId)
      .order("display_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("onboarding_profiles")
      .select("user_id, compatibility_profile")
      .eq("user_id", user.id)
      .maybeSingle()
  ]);

  if (messagesRes.error || profileRes.error || photoRes.error || currentProfileRes.error) {
    return NextResponse.json({ error: "Could not load messages." }, { status: 500 });
  }

  let counterpartPhotoUrl: string | null = null;
  if (photoRes.data?.storage_path) {
    const signed = await supabase.storage
      .from("profile-photos")
      .createSignedUrl(String(photoRes.data.storage_path), 60 * 60);
    if (!signed.error && signed.data?.signedUrl) {
      counterpartPhotoUrl = signed.data.signedUrl;
    }
  }
  if (!counterpartPhotoUrl && photoRes.data?.image_base64) {
    const mime = photoRes.data?.mime_type ?? "image/jpeg";
    counterpartPhotoUrl = `data:${mime};base64,${photoRes.data.image_base64}`;
  }

  const currentCompatibility = currentProfileRes.data
    ? toCompatibilityProfileFromRow(user.id, currentProfileRes.data as Record<string, unknown>)
    : null;
  const counterpartCompatibility = profileRes.data
    ? toCompatibilityProfileFromRow(counterpartId, {
        user_id: counterpartId,
        compatibility_profile: (profileRes.data as Record<string, unknown>).compatibility_profile
      })
    : null;
  const compatibility =
    currentCompatibility && counterpartCompatibility
      ? computeCompatibility(currentCompatibility, counterpartCompatibility)
      : null;

  return NextResponse.json(
    {
      match: {
        id: String(match.id),
        counterpartId,
        counterpartFirstName: profileRes.data?.first_name ? String(profileRes.data.first_name) : "Match",
        counterpartPhotoUrl,
        createdAt: String(match.created_at)
      },
      messages: (messagesRes.data ?? []).map((row) => ({
        id: String(row.id),
        matchId: String(row.match_id),
        senderId: String(row.sender_id),
        body: String(row.body),
        createdAt: String(row.created_at)
      })),
      uiSummary: {
        profileHighlights: compatibility?.notes?.slice(0, 3) ?? [],
        compatibilitySnapshot: compatibility
          ? {
              score: compatibility.score,
              tier: compatibility.tier,
              warnings: compatibility.warnings
            }
          : null
      }
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

  const parsedParams = paramsSchema.safeParse(await context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid match id." }, { status: 400 });
  }

  const parsedBody = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Message body is required." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const match = await loadAuthorizedMatch(supabase, parsedParams.data.matchId, user.id);
  if (!match) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  const counterpartId = String(match.user_low) === user.id ? String(match.user_high) : String(match.user_low);

  const insertRes = await supabase
    .from("match_messages")
    .insert({
      match_id: parsedParams.data.matchId,
      sender_id: user.id,
      body: parsedBody.data.body
    })
    .select("id, match_id, sender_id, body, created_at")
    .single();

  if (insertRes.error || !insertRes.data) {
    return NextResponse.json({ error: "Could not send message." }, { status: 500 });
  }

  await recordMessageOutcome(supabase, {
    matchId: parsedParams.data.matchId,
    senderId: user.id,
    recipientId: counterpartId
  }).catch(() => undefined);

  return NextResponse.json(
    {
      message: {
        id: String(insertRes.data.id),
        matchId: String(insertRes.data.match_id),
        senderId: String(insertRes.data.sender_id),
        body: String(insertRes.data.body),
        createdAt: String(insertRes.data.created_at)
      }
    },
    { status: 200 }
  );
}
