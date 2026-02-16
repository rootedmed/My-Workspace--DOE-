import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ensureAppUser } from "@/lib/auth/ensureAppUser";
import { isValidCsrf } from "@/lib/security/csrf";
import { getRequestId, logStructured } from "@/lib/observability/logger";
import { pickSupabaseError } from "@/lib/observability/supabase";

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
    | {
        questionId?: string;
        value?: string | number;
        nextStep?: number;
        currentStep?: number;
        totalSteps?: number;
        mode?: "fast" | "deep";
      }
    | null;

  const questionId = payload?.questionId?.trim();
  if (!questionId) {
    return NextResponse.json({ error: "questionId is required." }, { status: 400 });
  }

  const value = payload?.value;
  if (typeof value !== "string" && typeof value !== "number") {
    return NextResponse.json({ error: "Answer value is required." }, { status: 400 });
  }

  const currentStep = Math.max(1, Number(payload?.currentStep ?? 1));
  const nextStep = Math.max(currentStep, Number(payload?.nextStep ?? currentStep));
  const totalSteps = Math.max(1, Number(payload?.totalSteps ?? 3));
  const mode = payload?.mode === "deep" ? "deep" : "fast";

  const supabase = await createServerSupabaseClient();

  logStructured("info", "onboarding_event", {
    request_id: requestId,
    event_type: "answer_selected",
    user_id: user.id,
    step: currentStep,
    question_id: questionId
  });

  const existing = await supabase.from("onboarding_drafts").select("answers").eq("user_id", user.id).maybeSingle();
  if (existing.error) {
    const err = pickSupabaseError(existing.error);
    return NextResponse.json({ error: "Could not read onboarding draft.", details: err }, { status: 500 });
  }

  const answers = {
    ...((existing.data?.answers as Record<string, unknown> | null) ?? {}),
    [questionId]: value
  };

  const [draftRes, progressRes] = await Promise.all([
    supabase
      .from("onboarding_drafts")
      .upsert({ user_id: user.id, answers, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
      .select("updated_at")
      .single(),
    supabase
      .from("onboarding_progress")
      .upsert(
        {
          user_id: user.id,
          current_step: nextStep,
          completed: nextStep > totalSteps,
          total_steps: totalSteps,
          mode,
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      )
      .select("current_step, completed, total_steps, mode, updated_at")
      .single()
  ]);

  if (draftRes.error || progressRes.error || !progressRes.data) {
    const err = pickSupabaseError(draftRes.error ?? progressRes.error);
    logStructured("error", "supabase_write", {
      request_id: requestId,
      operation: "upsert",
      table: "onboarding_drafts",
      user_id: user.id,
      status: "error",
      error_code: err?.code ?? null,
      error_message: err?.message ?? null,
      error_details: err?.details ?? null
    });
    return NextResponse.json({ error: "Could not persist onboarding answer.", details: err }, { status: 500 });
  }

  logStructured("info", "onboarding_event", {
    request_id: requestId,
    event_type: "answer_saved",
    user_id: user.id,
    step: currentStep,
    question_id: questionId
  });

  logStructured("info", "onboarding_event", {
    request_id: requestId,
    event_type: "step_advanced",
    user_id: user.id,
    step: nextStep,
    question_id: questionId
  });

  return NextResponse.json({ progress: progressRes.data }, { status: 200 });
}
