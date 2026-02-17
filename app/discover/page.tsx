import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DiscoverFeed } from "@/components/discover/DiscoverFeed";
import { BottomTabs } from "@/components/navigation/BottomTabs";

export default async function DiscoverPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
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
