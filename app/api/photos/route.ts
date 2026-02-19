import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { assertWriteAllowed } from "@/lib/config/env.server";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";
import { getRequestId, logStructured } from "@/lib/observability/logger";
import { pickSupabaseError } from "@/lib/observability/supabase";

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const PHOTO_BUCKET = "profile-photos";

function parseSlot(raw: FormDataEntryValue | null): number {
  const slot = Number(raw);
  if (!Number.isInteger(slot) || slot < 1 || slot > 6) {
    return 1;
  }
  return slot;
}

function isFileLike(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    "size" in value &&
    "type" in value &&
    "arrayBuffer" in value
  );
}

function extensionForType(mimeType: string): string {
  const lookup: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif"
  };

  return lookup[mimeType] ?? "bin";
}

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_photos")
    .select("id, slot, display_order, mime_type, storage_path, created_at, updated_at")
    .eq("user_id", user.id)
    .order("display_order", { ascending: true })
    .order("slot", { ascending: true });

  if (error) {
    const err = pickSupabaseError(error);
    logStructured("error", "supabase_write", {
      request_id: requestId,
      operation: "select",
      table: "user_photos",
      user_id: user.id,
      status: "error",
      error_code: err?.code ?? null,
      error_message: err?.message ?? null,
      error_details: err?.details ?? null
    });
    return NextResponse.json(
      {
        error: "Could not load photos.",
        details: {
          code: err?.code ?? null,
          message: err?.message ?? null,
          details: err?.details ?? null
        }
      },
      { status: 500 }
    );
  }

  const rows = data ?? [];
  const signed = await Promise.all(
    rows.map(async (row) => {
      const path = String(row.storage_path);
      const signedResult = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path, 60 * 60);

      if (signedResult.error || !signedResult.data?.signedUrl) {
        const err = pickSupabaseError(signedResult.error);
        logStructured("error", "supabase_storage", {
          request_id: requestId,
          operation: "signed_url",
          bucket: PHOTO_BUCKET,
          user_id: user.id,
          object_path: path,
          status: "error",
          error_code: err?.code ?? null,
          error_message: err?.message ?? null,
          error_details: err?.details ?? null
        });
        return null;
      }

      return {
        id: String(row.id),
        slot: Number(row.slot),
        displayOrder: Number(row.display_order ?? row.slot),
        mimeType: String(row.mime_type),
        storagePath: path,
        url: signedResult.data.signedUrl,
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
      };
    })
  );

  return NextResponse.json({ photos: signed.filter(Boolean) }, { status: 200 });
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

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

  try {
    await ensureAppUser({
      id: user.id,
      email: user.email,
      firstName: user.firstName
    });
  } catch (error) {
    return NextResponse.json({ error: "Could not initialize account row.", details: String(error) }, { status: 500 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid upload payload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!isFileLike(file)) {
    return NextResponse.json({ error: "Photo file is required." }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Photo must be between 1 byte and 5MB." }, { status: 400 });
  }

  const slot = parseSlot(form.get("slot"));
  const ext = extensionForType(file.type);
  const storagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const supabase = await createServerSupabaseClient();
  const existing = await supabase
    .from("user_photos")
    .select("id, storage_path")
    .eq("user_id", user.id)
    .eq("slot", slot)
    .maybeSingle();

  if (existing.error) {
    const err = pickSupabaseError(existing.error);
    logStructured("error", "supabase_write", {
      request_id: requestId,
      operation: "select",
      table: "user_photos",
      user_id: user.id,
      status: "error",
      error_code: err?.code ?? null,
      error_message: err?.message ?? null,
      error_details: err?.details ?? null
    });
    return NextResponse.json(
      {
        error: "Could not read existing photo slot.",
        details: {
          code: err?.code ?? null,
          message: err?.message ?? null,
          details: err?.details ?? null
        }
      },
      { status: 500 }
    );
  }

  const uploadResult = await supabase.storage.from(PHOTO_BUCKET).upload(storagePath, file, {
    contentType: file.type,
    upsert: false
  });

  if (uploadResult.error) {
    const err = pickSupabaseError(uploadResult.error);
    logStructured("error", "supabase_storage", {
      request_id: requestId,
      operation: "upload",
      bucket: PHOTO_BUCKET,
      user_id: user.id,
      object_path: storagePath,
      status: "error",
      error_code: err?.code ?? null,
      error_message: err?.message ?? null,
      error_details: err?.details ?? null
    });
    return NextResponse.json(
      {
        error: "Could not upload photo to storage.",
        details: {
          code: err?.code ?? null,
          message: err?.message ?? null,
          details: err?.details ?? null
        }
      },
      { status: 500 }
    );
  }

  logStructured("info", "supabase_storage", {
    request_id: requestId,
    operation: "upload",
    bucket: PHOTO_BUCKET,
    user_id: user.id,
    object_path: storagePath,
    status: "ok"
  });

  const upsertResult = await supabase
    .from("user_photos")
    .upsert(
      {
        user_id: user.id,
        slot,
        display_order: slot,
        mime_type: file.type,
        storage_path: storagePath,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,slot" }
    )
    .select("id, slot, display_order, mime_type, storage_path, created_at, updated_at")
    .single();

  if (upsertResult.error || !upsertResult.data) {
    const err = pickSupabaseError(upsertResult.error);
    logStructured("error", "supabase_write", {
      request_id: requestId,
      operation: "upsert",
      table: "user_photos",
      user_id: user.id,
      status: "error",
      error_code: err?.code ?? null,
      error_message: err?.message ?? null,
      error_details: err?.details ?? null
    });
    return NextResponse.json(
      {
        error: "Could not store photo metadata.",
        details: {
          code: err?.code ?? null,
          message: err?.message ?? null,
          details: err?.details ?? null
        }
      },
      { status: 500 }
    );
  }

  logStructured("info", "supabase_write", {
    request_id: requestId,
    operation: "upsert",
    table: "user_photos",
    user_id: user.id,
    status: "ok"
  });

  const oldPath = existing.data?.storage_path ? String(existing.data.storage_path) : null;
  if (oldPath && oldPath !== storagePath) {
    const removeResult = await supabase.storage.from(PHOTO_BUCKET).remove([oldPath]);
    if (removeResult.error) {
      const err = pickSupabaseError(removeResult.error);
      logStructured("warn", "supabase_storage", {
        request_id: requestId,
        operation: "remove",
        bucket: PHOTO_BUCKET,
        user_id: user.id,
        object_path: oldPath,
        status: "error",
        error_code: err?.code ?? null,
        error_message: err?.message ?? null,
        error_details: err?.details ?? null
      });
    }
  }

  const signedResult = await supabase
    .storage
    .from(PHOTO_BUCKET)
    .createSignedUrl(String(upsertResult.data.storage_path), 60 * 60);

  if (signedResult.error || !signedResult.data?.signedUrl) {
    const err = pickSupabaseError(signedResult.error);
    return NextResponse.json(
      {
        error: "Photo saved but URL signing failed.",
        details: {
          code: err?.code ?? null,
          message: err?.message ?? null,
          details: err?.details ?? null
        }
      },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      photo: {
        id: String(upsertResult.data.id),
        slot: Number(upsertResult.data.slot),
        displayOrder: Number(upsertResult.data.display_order ?? upsertResult.data.slot),
        mimeType: String(upsertResult.data.mime_type),
        storagePath: String(upsertResult.data.storage_path),
        url: signedResult.data.signedUrl,
        createdAt: String(upsertResult.data.created_at),
        updatedAt: String(upsertResult.data.updated_at)
      }
    },
    { status: 200 }
  );
}

export async function DELETE(request: Request) {
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

  const url = new URL(request.url);
  const photoId = url.searchParams.get("id")?.trim() ?? "";

  if (!photoId) {
    return NextResponse.json({ error: "Photo id is required." }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const existing = await supabase
    .from("user_photos")
    .select("id, storage_path")
    .eq("user_id", user.id)
    .eq("id", photoId)
    .maybeSingle();

  if (existing.error || !existing.data) {
    return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  }

  const deleteRes = await supabase
    .from("user_photos")
    .delete()
    .eq("user_id", user.id)
    .eq("id", photoId)
    .select("id")
    .single();

  if (deleteRes.error) {
    return NextResponse.json({ error: "Could not delete photo." }, { status: 500 });
  }

  const storagePath =
    typeof existing.data.storage_path === "string" && existing.data.storage_path.length > 0
      ? existing.data.storage_path
      : null;
  if (storagePath) {
    await supabase.storage.from(PHOTO_BUCKET).remove([storagePath]).catch(() => undefined);
  }

  return NextResponse.json({ deleted: true, id: photoId }, { status: 200 });
}
