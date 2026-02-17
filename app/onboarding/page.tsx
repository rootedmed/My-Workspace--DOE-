import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { OnboardingFlow } from "./OnboardingFlow";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ force?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }
  const params = await searchParams;
  const force = params.force === "1";

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("onboarding_profiles")
    .select("compatibility_profile")
    .eq("user_id", user.id)
    .maybeSingle();

  if (data?.compatibility_profile && !force) {
    redirect("/discover");
  }

  return <OnboardingFlow userId={user.id} />;
}
