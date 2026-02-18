import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { GuestToolPanel } from "@/components/guest/GuestToolPanel";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

export default async function GuestCompatibilityPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }

  if (!isUiRouteEnabled("guest_snapshot")) {
    return (
      <main className="app-main">
        <section className="app-shell">
          <div className="app-screen stack">
            <UiFallbackNotice
              title="Guest compatibility refresh is temporarily paused"
              description="This experience is currently gated for staged rollout."
              primaryHref="/me"
              primaryLabel="Back to Profile"
              secondaryHref="/matches"
              secondaryLabel="Open Matches"
            />
          </div>
          <BottomTabs current="me" />
        </section>
      </main>
    );
  }

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <section className="panel stack">
            <p className="eyebrow">Guest Compatibility</p>
            <h1>Bring someone off-app into your compatibility flow</h1>
            <p className="muted">
              Create a private link, send it, and receive a structured compatibility snapshot when they finish.
            </p>
            <p className="tiny muted">
              Ideal for friend set-ups, someone you met offline, or a second-opinion check before a first date.
            </p>
          </section>
          <GuestToolPanel />
        </div>
        <BottomTabs current="me" />
      </section>
    </main>
  );
}
