import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";

type TraitCard = {
  label: string;
  value: string;
  blurb: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 3;
}

function toTraitCards(profile: Record<string, unknown>): TraitCard[] {
  const conflictSpeed = asNumber(profile.conflict_speed);
  const openness = asNumber(profile.emotional_openness);
  const supportNeed = asString(profile.support_need);
  const vision = asString(profile.relationship_vision);
  const growth = asString(profile.growth_intention);

  const conflictStyle =
    conflictSpeed <= 2
      ? { value: "Approach first", blurb: "You prefer to resolve conflict quickly." }
      : conflictSpeed >= 4
        ? { value: "Process first", blurb: "You prefer space before returning to conflict." }
        : { value: "Balanced", blurb: "You flex between immediate talk and reflection." };

  const opennessStyle =
    openness <= 2
      ? { value: "Very open", blurb: "You are comfortable with emotional depth." }
      : openness >= 4
        ? { value: "Selective", blurb: "You open up carefully and value emotional pacing." }
        : { value: "Developing", blurb: "You are intentional about emotional openness." };

  const supportStyle = {
    value:
      supportNeed === "validation"
        ? "Validation"
        : supportNeed === "practical"
          ? "Practical help"
          : supportNeed === "presence"
            ? "Close presence"
            : supportNeed === "space"
              ? "Space first"
              : "Distraction",
    blurb: "This is what you tend to need most under stress."
  };

  const visionStyle = {
    value:
      vision === "independent"
        ? "Independent together"
        : vision === "enmeshed"
          ? "Deeply intertwined"
          : vision === "friendship"
            ? "Best-friend foundation"
            : vision === "safe"
              ? "Safe harbour"
              : "Shared adventure",
    blurb: "This is your default relationship structure preference."
  };

  const growthStyle = {
    value:
      growth === "depth"
        ? "Deeper honesty"
        : growth === "balance"
          ? "Better balance"
          : growth === "chosen"
            ? "Being chosen"
            : growth === "peace"
              ? "Less conflict"
              : "Real alignment",
    blurb: "Your top growth intention for your next relationship."
  };

  return [
    { label: "Conflict Pace", ...conflictStyle },
    { label: "Emotional Openness", ...opennessStyle },
    { label: "Support Need", ...supportStyle },
    { label: "Relationship Vision", ...visionStyle },
    { label: "Growth Intention", ...growthStyle }
  ];
}

export default async function ResultsPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const onboarding = await getOnboardingV2State(user.id);
  if (!onboarding.hasProfile || !onboarding.compatibilityProfile) {
    redirect("/onboarding");
  }

  const cards = toTraitCards(onboarding.compatibilityProfile);

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen">
          <div className="stack">
            <section className="panel elevated stack">
              <p className="eyebrow">Dating Style Snapshot</p>
              <h1>Your relationship style</h1>
              <p className="muted">A direct summary from your new onboarding profile.</p>
            </section>

            <section className="stats-grid" aria-label="Dating style traits">
              {cards.map((card) => (
                <article key={card.label} className="metric">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <p className="muted small">{card.blurb}</p>
                </article>
              ))}
            </section>

            <section className="panel stack">
              <h2>What this means</h2>
              <p className="muted">
                Your profile is now calibrated for compatibility-first matching. Discover will prioritize stronger
                fit and call out potential friction early.
              </p>
              <Link className="button-link" href="/discover">
                See compatible matches
              </Link>
            </section>
          </div>
        </div>
        <BottomTabs current="home" />
      </section>
    </main>
  );
}
