import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getUserProfileSetupState } from "@/lib/profile/setup";

const PHOTO_BUCKET = "profile-photos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const setupState = await getUserProfileSetupState(user.id);
  if (!setupState.isComplete) {
    return NextResponse.json(
      {
        matches: [],
        profileIncomplete: true,
        missingFields: setupState.missingRequired
      },
      { status: 200 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const matchesRes = await supabase
    .from("mutual_matches")
    .select("id, user_low, user_high, created_at")
    .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
    .order("created_at", { ascending: false });

  if (matchesRes.error) {
    return NextResponse.json({ error: "Could not load matches." }, { status: 500 });
  }

  const rawMatches = matchesRes.data ?? [];
  const counterpartIds = rawMatches.map((row) =>
    String(row.user_low) === user.id ? String(row.user_high) : String(row.user_low)
  );

  if (counterpartIds.length === 0) {
    return NextResponse.json({ matches: [] }, { status: 200 });
  }

  const [profilesRes, photosRes] = await Promise.all([
    supabase
      .from("onboarding_profiles")
      .select("user_id, first_name, age_range, location_preference")
      .in("user_id", counterpartIds),
    supabase
      .from("user_photos")
      .select("user_id, display_order, storage_path, mime_type, image_base64")
      .in("user_id", counterpartIds)
  ]);

  if (profilesRes.error || photosRes.error) {
    return NextResponse.json({ error: "Could not load match details." }, { status: 500 });
  }

  const profileById = new Map(
    (profilesRes.data ?? []).map((row) => [
      String(row.user_id),
      {
        firstName: String(row.first_name),
        ageRange: typeof row.age_range === "string" ? row.age_range : null,
        locationPreference: typeof row.location_preference === "string" ? row.location_preference : null
      }
    ])
  );
  const photoPathById = new Map<string, { order: number; path: string }>();
  const photoInlineById = new Map<string, { order: number; url: string }>();
  for (const row of photosRes.data ?? []) {
    const userId = String(row.user_id);
    const order = typeof row.display_order === "number" ? row.display_order : 99;
    const path = typeof row.storage_path === "string" ? row.storage_path : "";
    const mimeType = typeof row.mime_type === "string" ? row.mime_type : "image/jpeg";
    const imageBase64 = typeof row.image_base64 === "string" ? row.image_base64 : "";
    if (path) {
      const existingPath = photoPathById.get(userId);
      if (!existingPath || order < existingPath.order) {
        photoPathById.set(userId, { order, path });
      }
    }
    if (imageBase64) {
      const existingInline = photoInlineById.get(userId);
      if (!existingInline || order < existingInline.order) {
        photoInlineById.set(userId, { order, url: `data:${mimeType};base64,${imageBase64}` });
      }
    }
  }
  const photoUrlById = new Map<string, string>();

  await Promise.all(
    counterpartIds.map(async (id) => {
      const path = photoPathById.get(id)?.path;
      if (!path) return;
      const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
      if (!signed.error && signed.data?.signedUrl) {
        photoUrlById.set(id, signed.data.signedUrl);
      }
    })
  );

  const matches = rawMatches.map((row) => {
    const counterpartId = String(row.user_low) === user.id ? String(row.user_high) : String(row.user_low);
    const profile = profileById.get(counterpartId);
    return {
      id: String(row.id),
      counterpartId,
      counterpartFirstName: profile?.firstName ?? "Match",
      counterpartAgeRange: profile?.ageRange ?? null,
      counterpartLocationPreference: profile?.locationPreference ?? null,
      photoUrl: photoUrlById.get(counterpartId) ?? photoInlineById.get(counterpartId)?.url ?? null,
      createdAt: String(row.created_at)
    };
  });

  return NextResponse.json({ matches }, { status: 200 });
}
