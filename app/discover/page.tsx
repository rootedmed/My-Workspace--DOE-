import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DiscoverFeed } from "@/components/discover/DiscoverFeed";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

export default async function DiscoverPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }

  if (!isUiRouteEnabled("discover")) {
    return (
      <main className="app-main">
        <section className="app-shell">
          <div className="app-screen stack">
            <UiFallbackNotice
              title="Discover refresh is temporarily paused"
              description="The redesigned discover experience is currently gated for staged rollout."
              primaryHref="/matches"
              primaryLabel="Open Matches"
              secondaryHref="/app"
              secondaryLabel="Back to Home"
            />
          </div>
          <BottomTabs current="discover" />
        </section>
      </main>
    );
  }

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen">
          <DiscoverFeed />
        </div>
        <BottomTabs current="discover" />
      </section>
    </main>
  );
}
