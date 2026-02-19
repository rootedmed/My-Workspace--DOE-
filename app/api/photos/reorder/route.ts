import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { assertWriteAllowed } from "@/lib/config/env.server";

const payloadSchema = z.object({
  orderedPhotoIds: z.array(z.string().uuid()).min(1).max(6)
});

export async function POST(request: Request) {
  try {
    assertWriteAllowed();
  } catch {
    return NextResponse.json({ error: "Preview is read-only." }, { status: 503 });
  }

  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const uniqueIds = new Set(parsed.data.orderedPhotoIds);
  if (uniqueIds.size !== parsed.data.orderedPhotoIds.length) {
    return NextResponse.json({ error: "Photo order contains duplicates." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const photosRes = await supabase
    .from("user_photos")
    .select("id")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true })
    .order("slot", { ascending: true });

  if (photosRes.error) {
    return NextResponse.json({ error: "Could not load photos." }, { status: 500 });
  }

  const existingIds = (photosRes.data ?? []).map((row) => String(row.id));
  if (existingIds.length !== parsed.data.orderedPhotoIds.length) {
    return NextResponse.json({ error: "Order must include all photos." }, { status: 400 });
  }
  const existingSet = new Set(existingIds);
  const includesUnknown = parsed.data.orderedPhotoIds.some((id) => !existingSet.has(id));
  if (includesUnknown) {
    return NextResponse.json({ error: "Order contains unknown photo ids." }, { status: 400 });
  }

  for (let index = 0; index < parsed.data.orderedPhotoIds.length; index += 1) {
    const photoId = parsed.data.orderedPhotoIds[index];
    const update = await supabase
      .from("user_photos")
      .update({
        display_order: index + 1,
        updated_at: new Date().toISOString()
      })
      .eq("user_id", user.id)
      .eq("id", photoId)
      .select("id")
      .single();

    if (update.error) {
      return NextResponse.json({ error: "Could not save photo order." }, { status: 500 });
    }
  }

  return NextResponse.json(
    {
      saved: true,
      orderedPhotoIds: parsed.data.orderedPhotoIds
    },
    { status: 200 }
  );
}
