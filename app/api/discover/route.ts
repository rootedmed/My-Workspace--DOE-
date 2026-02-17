import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OnboardingProfile } from "@/lib/domain/types";
import { scoreCompatibility } from "@/lib/matching/compatibility";
import { isValidCsrf } from "@/lib/security/csrf";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";

const PHOTO_BUCKET = "profile-photos";

type CandidatePayload = {
  id: string;
  firstName: string;
  ageRange: string;
  locationPreference: string;
  photoUrl: string | null;
  compatibilityHighlight: string;
  watchForInsight: string;
  likedYou: boolean;
};

const scoreLabel: Record<string, string> = {
  intent: "Intent alignment",
  lifestyle: "Lifestyle rhythm",
  attachment: "Emotional closeness style",
  conflictRegulation: "Conflict repair style",
  personality: "Personality fit",
  novelty: "Novelty vs routine"
};

function toProfile(row: Record<string, unknown>): OnboardingProfile {
  return {
    id: String(row.user_id),
    firstName: String(row.first_name),
    ageRange: row.age_range as OnboardingProfile["ageRange"],
    locationPreference: row.location_preference as OnboardingProfile["locationPreference"],
    intent: row.intent as OnboardingProfile["intent"],
    tendencies: row.tendencies as OnboardingProfile["tendencies"],
    personality: row.personality as OnboardingProfile["personality"],
    createdAt: String(row.created_at)
  };
}

function toInsights(current: OnboardingProfile, candidate: OnboardingProfile): { highlight: string; watchFor: string } {
  const scored = scoreCompatibility(current, candidate);
  const pairs = Object.entries(scored.componentScores).map(([key, value]) => ({ key, value }));
  const best = pairs.sort((a, b) => b.value - a.value)[0];
  const low = pairs.sort((a, b) => a.value - b.value)[0];
  return {
    highlight: `${scoreLabel[best?.key ?? "intent"] ?? "Compatibility"} looks strong.`,
    watchFor: `${scoreLabel[low?.key ?? "lifestyle"] ?? "Style difference"} may need a quick conversation.`
  };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const url = new URL(request.url);
  const lookingForFilter = url.searchParams.get("lookingFor")?.trim() || "";
  const locationFilter = url.searchParams.get("locationPreference")?.trim() || "";

  const [currentProfileRes, profilesRes, mySwipesRes, incomingLikesRes] = await Promise.all([
    supabase
      .from("onboarding_profiles")
      .select("user_id, first_name, age_range, location_preference, intent, tendencies, personality, created_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("onboarding_profiles")
      .select("user_id, first_name, age_range, location_preference, intent, tendencies, personality, created_at")
      .neq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profile_swipes").select("target_user_id, decision").eq("actor_user_id", user.id),
    supabase
      .from("profile_swipes")
      .select("actor_user_id")
      .eq("target_user_id", user.id)
      .eq("decision", "like"),
  ]);

  if (currentProfileRes.error || !currentProfileRes.data) {
    return NextResponse.json({ candidates: [], incomingLikes: [], emptyReason: "Finish onboarding to use Discover." }, { status: 200 });
  }

  if (profilesRes.error) {
    if (profilesRes.error.code === "42501") {
      return NextResponse.json(
        {
          candidates: [],
          incomingLikes: [],
          emptyReason: "Discover is blocked until DB migration 008 is applied."
        },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: "Could not load discover candidates." }, { status: 500 });
  }
  const swipesTableMissing = mySwipesRes.error?.code === "42P01" || incomingLikesRes.error?.code === "42P01";
  if (!swipesTableMissing && (mySwipesRes.error || incomingLikesRes.error)) {
    return NextResponse.json({ error: "Could not load discover candidates." }, { status: 500 });
  }

  const currentProfile = toProfile(currentProfileRes.data as Record<string, unknown>);
  const allCandidates = (profilesRes.data ?? []).map((row) => toProfile(row as Record<string, unknown>));
  const swipeMap = new Map(
    ((mySwipesRes.data ?? []) as Array<{ target_user_id: string; decision: string }>).map((row) => [String(row.target_user_id), String(row.decision)])
  );
  const incomingLikeIds = new Set(
    ((incomingLikesRes.data ?? []) as Array<{ actor_user_id: string }>).map((row) => String(row.actor_user_id))
  );
  const filtered = allCandidates.filter((candidate) => {
    if (lookingForFilter && candidate.intent.lookingFor !== lookingForFilter) return false;
    if (locationFilter && candidate.locationPreference !== locationFilter) return false;
    return true;
  });

  const prioritized = [
    ...filtered.filter((candidate) => incomingLikeIds.has(candidate.id)),
    ...filtered.filter((candidate) => !incomingLikeIds.has(candidate.id))
  ];
  const candidateIds = prioritized.map((candidate) => candidate.id);
  const incomingListIds = ((incomingLikesRes.data ?? []) as Array<{ actor_user_id: string }>)
    .map((row) => String(row.actor_user_id))
    .filter((id) => !swipeMap.has(id));
  const allPhotoIds = [...new Set([...candidateIds, ...incomingListIds])];

  const photosRes = allPhotoIds.length
    ? await supabase
        .from("user_photos")
        .select("user_id, storage_path, mime_type, image_base64")
        .in("user_id", allPhotoIds)
        .eq("slot", 1)
    : { data: [], error: null };

  if (photosRes.error) {
    return NextResponse.json({ error: "Could not load candidate photos." }, { status: 500 });
  }

  const photoPathByUser = new Map<string, string>();
  const photoInlineByUser = new Map<string, string>();
  for (const row of photosRes.data ?? []) {
    const userId = String(row.user_id);
    const path = typeof row.storage_path === "string" ? row.storage_path : "";
    const mimeType = typeof row.mime_type === "string" ? row.mime_type : "image/jpeg";
    const imageBase64 = typeof row.image_base64 === "string" ? row.image_base64 : "";
    if (path) {
      photoPathByUser.set(userId, path);
    }
    if (imageBase64) {
      photoInlineByUser.set(userId, `data:${mimeType};base64,${imageBase64}`);
    }
  }

  const signedUrlByUser = new Map<string, string>();
  await Promise.all(
    allPhotoIds.map(async (id) => {
      const path = photoPathByUser.get(id);
      if (!path) return;
      const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
      if (!signed.error && signed.data?.signedUrl) {
        signedUrlByUser.set(id, signed.data.signedUrl);
      }
    })
  );

  const toCandidatePayload = (candidate: OnboardingProfile): CandidatePayload => {
    const insight = toInsights(currentProfile, candidate);
    return {
      id: candidate.id,
      firstName: candidate.firstName,
      ageRange: candidate.ageRange,
      locationPreference: candidate.locationPreference,
      photoUrl: signedUrlByUser.get(candidate.id) ?? photoInlineByUser.get(candidate.id) ?? null,
      compatibilityHighlight: insight.highlight,
      watchForInsight: insight.watchFor,
      likedYou: incomingLikeIds.has(candidate.id)
    };
  };

  const candidateById = new Map(allCandidates.map((candidate) => [candidate.id, candidate]));
  const incomingLikes = incomingListIds
    .map((id) => candidateById.get(id))
    .filter((candidate): candidate is OnboardingProfile => Boolean(candidate))
    .map((candidate) => toCandidatePayload(candidate));
  const candidates = prioritized.map((candidate) => toCandidatePayload(candidate));

  if (candidates.length === 0) {
    return NextResponse.json(
      {
        candidates: [],
        incomingLikes,
        emptyReason: "Invite a friend to test",
        filters: { lookingFor: lookingForFilter, locationPreference: locationFilter }
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    candidates,
    incomingLikes,
    emptyReason: null,
    filters: { lookingFor: lookingForFilter, locationPreference: locationFilter }
  }, { status: 200 });
}

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppUser({ id: user.id, email: user.email, firstName: user.firstName }).catch(() => undefined);

  const payload = (await request.json().catch(() => null)) as
    | { candidateId?: string; action?: "like" | "pass" }
    | null;
  const candidateId = payload?.candidateId?.trim() ?? "";
  const action = payload?.action;
  if (!candidateId || (action !== "like" && action !== "pass")) {
    return NextResponse.json({ error: "candidateId and valid action are required." }, { status: 400 });
  }
  if (candidateId === user.id) {
    return NextResponse.json({ error: "Cannot swipe on yourself." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const candidateRes = await supabase
    .from("onboarding_profiles")
    .select("user_id, first_name")
    .eq("user_id", candidateId)
    .maybeSingle();
  if (candidateRes.error || !candidateRes.data) {
    return NextResponse.json({ error: "Candidate not found." }, { status: 404 });
  }

  const swipeRes = await supabase
    .from("profile_swipes")
    .upsert(
      {
        actor_user_id: user.id,
        target_user_id: candidateId,
        decision: action,
        updated_at: new Date().toISOString()
      },
      { onConflict: "actor_user_id,target_user_id" }
    )
    .select("actor_user_id")
    .single();
  if (swipeRes.error) {
    if (swipeRes.error.code === "42P01") {
      return NextResponse.json({ error: "Swipe tables are not migrated yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not save swipe." }, { status: 500 });
  }

  if (action === "pass") {
    return NextResponse.json({ matched: false }, { status: 200 });
  }

  const reciprocalRes = await supabase
    .from("profile_swipes")
    .select("actor_user_id")
    .eq("actor_user_id", candidateId)
    .eq("target_user_id", user.id)
    .eq("decision", "like")
    .maybeSingle();

  if (reciprocalRes.error) {
    if (reciprocalRes.error.code === "42P01") {
      return NextResponse.json({ error: "Swipe tables are not migrated yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not evaluate mutual like." }, { status: 500 });
  }

  if (!reciprocalRes.data) {
    return NextResponse.json({ matched: false }, { status: 200 });
  }

  const [low, high] = [user.id, candidateId].sort();
  const existingMatchRes = await supabase
    .from("mutual_matches")
    .select("id")
    .eq("user_low", low)
    .eq("user_high", high)
    .maybeSingle();
  if (existingMatchRes.error) {
    return NextResponse.json({ error: "Could not create match." }, { status: 500 });
  }

  const createdMatchRes = existingMatchRes.data
    ? existingMatchRes
    : await supabase
        .from("mutual_matches")
        .insert({ user_low: low, user_high: high })
        .select("id")
        .single();

  if (createdMatchRes.error || !createdMatchRes.data) {
    return NextResponse.json({ error: "Could not create match." }, { status: 500 });
  }

  return NextResponse.json(
    {
      matched: true,
      matchId: String(createdMatchRes.data.id),
      candidateId,
      candidateFirstName: String(candidateRes.data.first_name)
    },
    { status: 200 }
  );
}
