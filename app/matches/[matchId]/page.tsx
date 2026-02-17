import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { MatchChat } from "@/components/matches/MatchChat";
import { getOnboardingV2State } from "@/lib/onboarding/v2";

type PageProps = {
  params: Promise<{ matchId: string }>;
};

export default async function MatchChatPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }

  const { matchId } = await params;

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen">
          <MatchChat matchId={matchId} currentUserId={user.id} />
        </div>
        <BottomTabs current="matches" />
      </section>
    </main>
  );
}
