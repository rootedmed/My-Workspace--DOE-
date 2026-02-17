import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BottomTabs } from "@/components/navigation/BottomTabs";

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("onboarding_profiles")
    .select("compatibility_profile, completed_at")
    .eq("user_id", user.id)
    .maybeSingle();

  const profile = (data?.compatibility_profile ?? null) as Record<string, unknown> | null;
  const hasProfile = Boolean(profile);

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
            </div>
          </section>

          {hasProfile ? (
            <section className="panel stack">
              <h2>Saved answers</h2>
              <pre className="prompt-card tiny" style={{ whiteSpace: "pre-wrap" }}>
                {JSON.stringify(profile, null, 2)}
              </pre>
            </section>
          ) : null}
        </div>
        <BottomTabs current="me" />
      </section>
    </main>
  );
}
