import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DiscoverFeed } from "@/components/discover/DiscoverFeed";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";

export default async function DiscoverPage() {
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
        <div className="app-screen">
          <DiscoverFeed />
        </div>
        <BottomTabs current="discover" />
      </section>
    </main>
  );
}
