import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { assertWriteAllowed } from "@/lib/config/env.server";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function parseSlot(raw: FormDataEntryValue | null): number {
  const slot = Number(raw);
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) {
    return 1;
  }
  return slot;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_photos")
    .select("id, slot, mime_type, image_base64, created_at, updated_at")
    .eq("user_id", user.id)
    .order("slot", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Could not load photos." }, { status: 500 });
  }

  const photos = (data ?? []).map((row) => ({
    id: String(row.id),
    slot: Number(row.slot),
    mimeType: String(row.mime_type),
    dataUrl: `data:${String(row.mime_type)};base64,${String(row.image_base64)}`,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  }));

  return NextResponse.json({ photos }, { status: 200 });
}

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

  const upserted = await db
    .upsertAuthUser({
      id: user.id,
      email: user.email ?? `${user.id}@local.invalid`,
      firstName: user.firstName ?? "Member"
    })
    .catch(() => null);
  if (!upserted) {
    return NextResponse.json({ error: "Could not initialize your account profile." }, { status: 500 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Photo file is required." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Photo must be between 1 byte and 5MB." }, { status: 400 });
  }

  const slot = parseSlot(form.get("slot"));
  const bytes = Buffer.from(await file.arrayBuffer());
  const imageBase64 = bytes.toString("base64");

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_photos")
    .upsert(
      {
        user_id: user.id,
        slot,
        mime_type: file.type,
        image_base64: imageBase64,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,slot" }
    )
    .select("id, slot, mime_type, image_base64, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not store photo." }, { status: 500 });
  }

  return NextResponse.json(
    {
      photo: {
        id: String(data.id),
        slot: Number(data.slot),
        mimeType: String(data.mime_type),
        dataUrl: `data:${String(data.mime_type)};base64,${String(data.image_base64)}`,
        createdAt: String(data.created_at),
        updatedAt: String(data.updated_at)
      }
    },
    { status: 200 }
  );
}
