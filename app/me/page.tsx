import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  const hasProfile = onboarding.hasProfile;

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <section className="panel stack">
            <p className="eyebrow">Me</p>
            <h1>{user.firstName ?? "You"}</h1>
            <p className="muted">
              {hasProfile
                ? "Your onboarding profile is saved."
                : "Complete onboarding to unlock discover and matches."}
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
              <h2>Compatibility profile</h2>
              <div className="prompt-card">
                <p className="muted tiny">Attachment axis: {onboarding.attachmentAxis ?? "Not set"}</p>
                <p className="muted tiny">Readiness score: {onboarding.readinessScore ?? "N/A"}</p>
                <p className="muted tiny">
                  Completed: {onboarding.completedAt ? new Date(onboarding.completedAt).toLocaleString() : "Unknown"}
                </p>
              </div>
            </section>
          ) : null}
        </div>
        <BottomTabs current="me" />
      </section>
    </main>
  );
}
