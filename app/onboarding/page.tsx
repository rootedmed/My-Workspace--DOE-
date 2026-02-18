import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { OnboardingFlow } from "./OnboardingFlow";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

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

  if (!isUiRouteEnabled("onboarding_results")) {
    return (
      <main className="public-main">
        <UiFallbackNotice
          title="Onboarding refresh is temporarily paused"
          description="This experience is currently gated while rollout health is reviewed."
          primaryHref="/app"
          primaryLabel="Back to Home"
          secondaryHref="/discover"
          secondaryLabel="Open Discover"
        />
      </main>
    );
  }

  return <OnboardingFlow userId={user.id} />;
}
