import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

export default async function ProtectedAppPage() {
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
              title="Home refresh is temporarily paused"
              description="This visual module is currently gated for rollout."
              primaryHref="/discover"
              primaryLabel="Open Discover"
              secondaryHref="/me"
              secondaryLabel="Open profile"
            />
          </div>
          <BottomTabs current="home" />
        </section>
      </main>
    );
  }

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <section className="panel stack home-hero">
            <p className="eyebrow">Home</p>
            <h1>Welcome back, {user.firstName ?? "there"}</h1>
            <p className="muted">
              You’ve done the hard part. Now move through dating with more confidence and less guesswork.
            </p>
          </section>

          <section className="panel stack">
            <h2>Your relationship style at a glance</h2>
            <p className="muted">
              Your profile is calibrated for emotional fit, conflict rhythm, and long-term alignment.
            </p>
            <div className="actions">
              <Link href="/results" className="button-link ghost">View Relationship DNA</Link>
            </div>
          </section>

          <section className="panel stack">
            <h2>Pick up where you left off</h2>
            <p className="muted">
              Keep discovering, check your matches, or run a guest compatibility check.
            </p>
            <div className="actions">
              <Link href="/discover" className="button-link">Open Discover</Link>
              <Link href="/matches" className="button-link ghost">Open Matches</Link>
              <Link href="/guest" className="button-link ghost">Guest Compatibility</Link>
            </div>
          </section>

          <section className="panel stack">
            <h2>What’s new this week</h2>
            <p className="muted">
              {onboarding.completedAt
                ? `Your profile has been active since ${new Date(onboarding.completedAt).toLocaleDateString()}.`
                : "Your profile is active and ready for new connections."}
            </p>
            <div className="actions">
              <Link href="/me" className="button-link ghost">Open Profile</Link>
            </div>
          </section>
        </div>
        <BottomTabs current="home" />
      </section>
    </main>
  );
}
