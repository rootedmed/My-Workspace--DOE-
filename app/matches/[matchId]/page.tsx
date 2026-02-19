import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { MatchChat } from "@/components/matches/MatchChat";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";
import { getUserProfileSetupState } from "@/lib/profile/setup";

type PageProps = {
  params: Promise<{ matchId: string }>;
  searchParams: Promise<{ tab?: string }>;
};

export default async function MatchChatPage({ params, searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }
  const profileSetup = await getUserProfileSetupState(user.id);
  if (!profileSetup.isComplete) {
    redirect("/profile/setup");
  }

  const { matchId } = await params;
  const qs = await searchParams;
  const initialTab = qs.tab === "chat" ? "chat" : "profile";

  if (!isUiRouteEnabled("matches")) {
    return (
      <main className="app-main">
        <section className="app-shell">
          <div className="app-screen stack">
            <UiFallbackNotice
              title="Match detail refresh is temporarily paused"
              description="This experience is currently gated for staged rollout."
              primaryHref="/matches"
              primaryLabel="Back to Matches"
              secondaryHref="/discover"
              secondaryLabel="Open Discover"
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
          <MatchChat matchId={matchId} currentUserId={user.id} initialTab={initialTab} />
        </div>
        <BottomTabs current="matches" />
      </section>
    </main>
  );
}
