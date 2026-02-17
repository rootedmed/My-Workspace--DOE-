import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PHOTO_BUCKET = "profile-photos";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      .select("user_id, first_name")
      .in("user_id", counterpartIds),
    supabase
      .from("user_photos")
      .select("user_id, storage_path")
      .in("user_id", counterpartIds)
      .eq("slot", 1)
  ]);

  if (profilesRes.error || photosRes.error) {
    return NextResponse.json({ error: "Could not load match details." }, { status: 500 });
  }

  const profileById = new Map((profilesRes.data ?? []).map((row) => [String(row.user_id), String(row.first_name)]));
  const photoById = new Map((photosRes.data ?? []).map((row) => [String(row.user_id), String(row.storage_path)]));
  const photoUrlById = new Map<string, string>();

  await Promise.all(
    counterpartIds.map(async (id) => {
      const path = photoById.get(id);
      if (!path) return;
      const signed = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);
      if (!signed.error && signed.data?.signedUrl) {
        photoUrlById.set(id, signed.data.signedUrl);
      }
    })
  );

  const matches = rawMatches.map((row) => {
    const counterpartId = String(row.user_low) === user.id ? String(row.user_high) : String(row.user_low);
    return {
      id: String(row.id),
      counterpartId,
      counterpartFirstName: profileById.get(counterpartId) ?? "Match",
      photoUrl: photoUrlById.get(counterpartId) ?? null,
      createdAt: String(row.created_at)
    };
  });

  return NextResponse.json({ matches }, { status: 200 });
}
