import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { MatchesList } from "@/components/matches/MatchesList";
import { BottomTabs } from "@/components/navigation/BottomTabs";

export default async function MatchesPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen">
          <MatchesList />
        </div>
        <BottomTabs current="matches" />
      </section>
    </main>
  );
}
