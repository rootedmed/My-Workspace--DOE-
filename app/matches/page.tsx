import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { MatchesList } from "@/components/matches/MatchesList";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

export default async function MatchesPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }

  if (!isUiRouteEnabled("matches")) {
    return (
      <main className="app-main">
        <section className="app-shell">
          <div className="app-screen stack">
            <UiFallbackNotice
              title="Matches refresh is temporarily paused"
              description="The redesigned matches experience is currently gated while rollout metrics are reviewed."
              primaryHref="/discover"
              primaryLabel="Open Discover"
              secondaryHref="/app"
              secondaryLabel="Back to Home"
            />
          </div>
          <BottomTabs current="matches" />
        </section>
      </main>
    );
  }

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen">
          <MatchesList />
        </div>
        <BottomTabs current="matches" />
      </section>
    </main>
  );
}
