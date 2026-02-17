import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const paramsSchema = z.object({ token: z.string().min(20) });

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid snapshot token." }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const nowIso = new Date().toISOString();
  const row = await supabase
    .from("shared_snapshots")
    .select("token, snapshot_data, expires_at, views")
    .eq("token", params.data.token)
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (row.error || !row.data) {
    return NextResponse.json({ error: "Snapshot not found or expired." }, { status: 404 });
  }
  await supabase
    .from("shared_snapshots")
    .update({ views: Number(row.data.views ?? 0) + 1 })
    .eq("token", params.data.token);
  return NextResponse.json(
    {
      snapshot: row.data.snapshot_data,
      expiresAt: row.data.expires_at,
      views: Number(row.data.views ?? 0) + 1
    },
    { status: 200 }
  );
}

export async function DELETE(_request: Request, context: { params: Promise<{ token: string }> }) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid snapshot token." }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const deleted = await supabase
    .from("shared_snapshots")
    .delete()
    .eq("token", params.data.token)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (deleted.error) {
    return NextResponse.json({ error: "Could not revoke snapshot." }, { status: 500 });
  }
  return NextResponse.json({ revoked: Boolean(deleted.data) }, { status: 200 });
}
