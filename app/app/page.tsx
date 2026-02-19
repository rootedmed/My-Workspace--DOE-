import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";
import { getUserProfileSetupState } from "@/lib/profile/setup";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function ProtectedAppPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile) {
    redirect("/onboarding");
  }
  const profileSetup = await getUserProfileSetupState(user.id);
  if (!profileSetup.isComplete) {
    redirect("/profile/setup");
  }

  if (!isUiRouteEnabled("home_me")) {
    return (
      <main className="app-main">
        <section className="app-shell">
          <div className="app-screen stack">
            <UiFallbackNotice
              title="Home refresh is temporarily paused"
              description="This visual module is currently gated for rollout."
              primaryHref="/discover"
              primaryLabel="Open Discover"
              secondaryHref="/me"
              secondaryLabel="Open profile"
            />
          </div>
          <BottomTabs current="home" />
        </section>
      </main>
    );
  }

  const supabase = await createServerSupabaseClient();
  const [candidateCountRes, incomingLikesRes, matchesRes] = await Promise.all([
    supabase
      .from("onboarding_profiles")
      .select("user_id", { count: "exact", head: true })
      .neq("user_id", user.id),
    supabase
      .from("profile_swipes")
      .select("actor_user_id", { count: "exact", head: true })
      .eq("target_user_id", user.id)
      .eq("decision", "like"),
    supabase
      .from("mutual_matches")
      .select("id", { count: "exact" })
      .or(`user_low.eq.${user.id},user_high.eq.${user.id}`)
      .limit(50)
  ]);

  const matchIds = (matchesRes.data ?? []).map((row) => String(row.id));
  const unreadRes = matchIds.length
    ? await supabase
        .from("match_messages")
        .select("id", { count: "exact", head: true })
        .in("match_id", matchIds)
        .neq("sender_id", user.id)
    : { count: 0 };

  const candidateCount = typeof candidateCountRes.count === "number" ? candidateCountRes.count : 0;
  const incomingLikesCount = typeof incomingLikesRes.count === "number" ? incomingLikesRes.count : 0;
  const unreadCount = typeof unreadRes.count === "number" ? unreadRes.count : 0;
  const matchesCount = typeof matchesRes.count === "number" ? matchesRes.count : matchIds.length;

  const primaryCta =
    incomingLikesCount > 0
      ? { href: "/matches", label: "Review matches" }
      : candidateCount > 0
        ? { href: "/discover", label: "Continue Discover" }
        : { href: "/guest", label: "Open guest compatibility" };

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen stack">
          <section className="panel stack home-hero">
            <p className="eyebrow">Today</p>
            <h1>Welcome back, {user.firstName ?? "there"}</h1>
            <p className="muted">Move with clarity. Keep momentum where it matters most.</p>
            <div className="actions">
              <Link href={primaryCta.href} className="button-link">{primaryCta.label}</Link>
            </div>
          </section>

          <section className="panel stack">
            <h2>New for you</h2>
            <div className="home-metrics-grid">
              <article className="prompt-card">
                <p className="tiny muted">Candidates</p>
                <p className="home-metric-value">{candidateCount}</p>
              </article>
              <article className="prompt-card">
                <p className="tiny muted">Incoming likes</p>
                <p className="home-metric-value">{incomingLikesCount}</p>
              </article>
              <article className="prompt-card">
                <p className="tiny muted">Unread messages</p>
                <p className="home-metric-value">{unreadCount}</p>
              </article>
            </div>
          </section>

          <section className="panel stack">
            <h2>Your momentum</h2>
            <p className="muted">
              Profile strength is {profileSetup.completionPercent}%. Matches active: {matchesCount}.
            </p>
            <p className="small">
              {incomingLikesCount > 0
                ? "You have people waiting. Review matches now."
                : "Keep your rhythm. A few focused swipes beat endless scrolling."}
            </p>
          </section>

          <section className="panel stack">
            <h2>One insight</h2>
            <p className="muted">You tend to connect most with people who share your relationship vision and lifestyle pace.</p>
            <div className="actions">
              <Link href="/results" className="button-link ghost">View relationship DNA</Link>
              <Link href="/me" className="button-link ghost">Edit profile</Link>
            </div>
          </section>
        </div>
        <BottomTabs current="home" />
      </section>
    </main>
  );
}
