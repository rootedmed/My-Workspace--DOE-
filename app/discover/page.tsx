import { getCurrentUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { DiscoverFeed } from "@/components/discover/DiscoverFeed";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function DiscoverPage() {
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
