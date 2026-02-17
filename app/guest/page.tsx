import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { GuestToolPanel } from "@/components/guest/GuestToolPanel";

export default async function GuestCompatibilityPage() {
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
            <p className="eyebrow">Guest Compatibility</p>
            <h1>Check compatibility with someone off-app</h1>
            <p className="muted">
              Create a private link, send it, and get a compatibility report when they complete it.
            </p>
          </section>
          <GuestToolPanel />
        </div>
        <BottomTabs current="me" />
      </section>
    </main>
  );
}
