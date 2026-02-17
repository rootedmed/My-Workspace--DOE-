import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";
import { isValidCsrf } from "@/lib/security/csrf";
import { getRequestId, logStructured } from "@/lib/observability/logger";
import { pickSupabaseError } from "@/lib/observability/supabase";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const [progressRes, draftRes] = await Promise.all([
    supabase
      .from("onboarding_progress")
      .select("current_step, completed, total_steps, mode, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("onboarding_drafts").select("answers, updated_at").eq("user_id", user.id).maybeSingle()
  ]);

  if (progressRes.error || draftRes.error) {
    const err = pickSupabaseError(progressRes.error ?? draftRes.error);
    logStructured("error", "supabase_write", {
      request_id: requestId,
      operation: "select",
      table: "onboarding_progress",
      user_id: user.id,
      status: "error",
      error_code: err?.code ?? null,
      error_message: err?.message ?? null,
      error_details: err?.details ?? null
    });
    return NextResponse.json({ error: "Could not load onboarding progress.", details: err }, { status: 500 });
  }

  return NextResponse.json(
    {
      progress: progressRes.data ?? {
        current_step: 1,
        completed: false,
        total_steps: 8,
        mode: "deep",
        updated_at: new Date().toISOString()
      },
      draft: draftRes.data?.answers ?? {}
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  if (!isValidCsrf(request)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureAppUser({ id: user.id, email: user.email, firstName: user.firstName }).catch(() => undefined);

  const payload = (await request.json().catch(() => null)) as
    | { currentStep?: number; completed?: boolean; totalSteps?: number; mode?: "fast" | "deep" }
    | null;

  const requestedCurrentStep = Math.max(1, Number(payload?.currentStep ?? 1));
  const totalSteps = Math.max(1, Number(payload?.totalSteps ?? 8));
  const mode = payload?.mode === "deep" ? "deep" : "deep";
  const completed = Boolean(payload?.completed);
  const currentStep = completed ? totalSteps : Math.min(requestedCurrentStep, totalSteps);

  const supabase = await createServerSupabaseClient();
  const upsertRes = await supabase
    .from("onboarding_progress")
    .upsert(
      {
        user_id: user.id,
        current_step: currentStep,
        completed,
        total_steps: totalSteps,
        mode,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("current_step, completed, total_steps, mode, updated_at")
    .single();

  if (upsertRes.error || !upsertRes.data) {
    const err = pickSupabaseError(upsertRes.error);
    logStructured("error", "supabase_write", {
      request_id: requestId,
      operation: "upsert",
      table: "onboarding_progress",
      user_id: user.id,
      status: "error",
      error_code: err?.code ?? null,
      error_message: err?.message ?? null,
      error_details: err?.details ?? null
    });
    return NextResponse.json({ error: "Could not update onboarding progress.", details: err }, { status: 500 });
  }

  logStructured("info", "supabase_write", {
    request_id: requestId,
    operation: "upsert",
    table: "onboarding_progress",
    user_id: user.id,
    status: "ok"
  });

  return NextResponse.json({ progress: upsertRes.data }, { status: 200 });
}
