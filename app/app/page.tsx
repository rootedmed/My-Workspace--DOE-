import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";

export default async function ProtectedAppPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <section className="panel stack">
            <p className="eyebrow">Home</p>
            <h1>Welcome back, {user.firstName ?? "there"}</h1>
            <p className="muted">
              Your onboarding is complete. Continue discovering people and building matches.
            </p>
            <div className="actions">
              <Link href="/discover" className="button-link">Open Discover</Link>
              <Link href="/matches" className="button-link ghost">Open Matches</Link>
            </div>
          </section>

          <section className="panel stack">
            <h2>Profile status</h2>
            <p className="muted tiny">
              Attachment axis: {onboarding.attachmentAxis ?? "Not set"} · Readiness: {onboarding.readinessScore ?? "N/A"}
            </p>
            <div className="actions">
              <Link href="/results" className="button-link ghost">View Results</Link>
              <Link href="/me" className="button-link ghost">Open Me</Link>
            </div>
          </section>
        </div>
        <BottomTabs current="home" />
      </section>
    </main>
  );
}
