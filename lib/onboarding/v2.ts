import { createServerSupabaseClient } from "@/lib/supabase/server";

export type OnboardingV2State = {
  hasProfile: boolean;
  compatibilityProfile: Record<string, unknown> | null;
  completedAt: string | null;
  readinessScore: number | null;
  attachmentAxis: string | null;
};

export async function getOnboardingV2State(userId: string): Promise<OnboardingV2State> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("onboarding_profiles")
    .select("compatibility_profile, completed_at, readiness_score, attachment_axis")
    .eq("user_id", userId)
    .maybeSingle();

  const compatibilityProfile = (data?.compatibility_profile ?? null) as Record<string, unknown> | null;
  return {
    hasProfile: Boolean(compatibilityProfile),
    compatibilityProfile,
    completedAt: typeof data?.completed_at === "string" ? data.completed_at : null,
    readinessScore: typeof data?.readiness_score === "number" ? data.readiness_score : null,
    attachmentAxis: typeof data?.attachment_axis === "string" ? data.attachment_axis : null
  };
}
