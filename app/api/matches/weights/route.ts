import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidCsrf } from "@/lib/security/csrf";
import { DEFAULT_USER_MATCH_WEIGHTS } from "@/lib/matching/revealedPreferences";

const schema = z.object({
  attachment: z.number().min(0.5).max(2).optional(),
  conflict: z.number().min(0.5).max(2).optional(),
  vision: z.number().min(0.5).max(2).optional(),
  expression: z.number().min(0).max(2).optional(),
  lifestyle: z.number().min(0).max(2).optional()
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_match_weights")
    .select("weights, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({ weights: DEFAULT_USER_MATCH_WEIGHTS, updatedAt: null }, { status: 200 });
    }
    return NextResponse.json({ error: "Could not load match weights." }, { status: 500 });
  }
  return NextResponse.json(
    {
      weights: (data?.weights as Record<string, number> | null) ?? DEFAULT_USER_MATCH_WEIGHTS,
      updatedAt: data?.updated_at ?? null
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const nextWeights = { ...DEFAULT_USER_MATCH_WEIGHTS, ...parsed.data };
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_match_weights")
    .upsert(
      {
        user_id: user.id,
        weights: nextWeights,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("weights, updated_at")
    .single();
  if (error || !data) {
    if (error?.code === "42P01") {
      return NextResponse.json({ error: "Weight tuning is not migrated yet." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not save match weights." }, { status: 500 });
  }
  return NextResponse.json({ weights: data.weights, updatedAt: data.updated_at }, { status: 200 });
}
