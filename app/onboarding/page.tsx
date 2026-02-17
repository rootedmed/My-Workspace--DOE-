import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { OnboardingFlow } from "./OnboardingFlow";
import { getOnboardingV2State } from "@/lib/onboarding/v2";

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

  const onboarding = await getOnboardingV2State(user.id);
  if (onboarding.hasProfile && !force) {
    redirect("/discover");
  }

  return <OnboardingFlow userId={user.id} />;
}
