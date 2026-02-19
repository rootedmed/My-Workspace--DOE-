import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";
import { ProfileHub } from "@/components/me/ProfileHub";

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }

  if (!isUiRouteEnabled("home_me")) {
    return (
      <main className="app-main">
        <section className="app-shell">
          <div className="app-screen stack">
            <UiFallbackNotice
              title="Profile refresh is temporarily paused"
              description="This visual module is currently gated for staged rollout."
              primaryHref="/app"
              primaryLabel="Back to Home"
              secondaryHref="/discover"
              secondaryLabel="Open Discover"
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
          <section className="panel stack profile-hero">
            <p className="eyebrow">Me</p>
            <h1>{user.firstName ?? "You"}</h1>
            <p className="muted">Your profile is live. Keep it current to get better matches.</p>
          </section>

          <ProfileHub firstName={user.firstName ?? "You"} />
        </div>
        <BottomTabs current="me" />
      </section>
    </main>
  );
}
