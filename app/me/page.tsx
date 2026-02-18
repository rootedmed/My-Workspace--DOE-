import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  const hasProfile = onboarding.hasProfile;

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
              secondaryHref={hasProfile ? "/discover" : "/onboarding"}
              secondaryLabel={hasProfile ? "Open Discover" : "Start onboarding"}
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
            <p className="muted">
              {hasProfile
                ? "Your relationship profile is ready and actively guiding your recommendations."
                : "Complete onboarding to unlock Discover and Matches."}
            </p>
            <div className="actions">
              <Link href={hasProfile ? "/discover" : "/onboarding"} className="button-link">
                {hasProfile ? "Open Discover" : "Start Onboarding"}
              </Link>
              {hasProfile ? (
                <Link href="/onboarding?force=1" className="button-link ghost">
                  Redo onboarding
                </Link>
              ) : null}
              {hasProfile ? (
                <Link href="/guest" className="button-link ghost">
                  Guest compatibility
                </Link>
              ) : null}
            </div>
          </section>

          {hasProfile ? (
            <section className="panel stack">
              <h2>Profile summary</h2>
              <div className="prompt-card">
                <p className="muted small">You’ve completed your relationship profile and your results are live.</p>
                <p className="muted tiny">Last updated: {onboarding.completedAt ? new Date(onboarding.completedAt).toLocaleDateString() : "Recently"}</p>
              </div>
              <div className="actions">
                <Link href="/results" className="button-link ghost">View Relationship DNA</Link>
                <Link href="/guest" className="button-link ghost">Guest Compatibility</Link>
              </div>
            </section>
          ) : null}
        </div>
        <BottomTabs current="me" />
      </section>
    </main>
  );
}
