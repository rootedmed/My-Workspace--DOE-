import { redirect } from "next/navigation";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getCurrentUser } from "@/lib/auth/session";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { getUserProfileSetupState } from "@/lib/profile/setup";
import { ProfileSetupWizard } from "@/components/profile/ProfileSetupWizard";

export default async function ProfileSetupPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }

  const setupState = await getUserProfileSetupState(user.id);
  if (setupState.isComplete) {
    redirect("/discover");
  }

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <ProfileSetupWizard />
        </div>
        <BottomTabs current="me" />
      </section>
    </main>
  );
}
