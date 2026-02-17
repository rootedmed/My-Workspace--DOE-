import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { MatchChat } from "@/components/matches/MatchChat";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ matchId: string }>;
};

export default async function MatchChatPage({ params }: PageProps) {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("onboarding_profiles")
    .select("compatibility_profile")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data?.compatibility_profile) {
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
