import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { BottomTabs } from "@/components/navigation/BottomTabs";
import { getOnboardingV2State } from "@/lib/onboarding/v2";
import { ShareSnapshotButton } from "@/components/results/ShareSnapshotButton";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

type SnapshotData = {
  attachmentStyle: string;
  conflictStyle: string;
  loveExpression: string;
  relationshipVision: string;
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 3;
}

function labelFromAttachmentAxis(axis: string): string {
  if (axis === "secure") return "Secure";
  if (axis === "anxious_lean") return "Secure with anxious tendencies";
  if (axis === "avoidant_lean") return "Secure with independent tendencies";
  if (axis === "anxious") return "Anxiously attached";
  if (axis === "avoidant") return "Avoidantly attached";
  return "Secure-leaning";
}

function toSnapshotData(profile: Record<string, unknown>, attachmentAxis: string | null): SnapshotData {
  const conflictSpeed = asNumber(profile.conflict_speed);
  const vision = asString(profile.relationship_vision);
  const loveExpression = Array.isArray(profile.love_expression)
    ? profile.love_expression.filter((item): item is string => typeof item === "string")
    : [];

  const loveLabels: Record<string, string> = {
    acts: "Acts of care",
    time: "Quality presence",
    words: "Words and affirmation",
    physical: "Physical closeness",
    gifts: "Thoughtful surprises"
  };
  const visionLabel =
    vision === "independent"
      ? "Independent together"
      : vision === "enmeshed"
        ? "Deeply intertwined"
        : vision === "friendship"
          ? "Best-friend foundation"
          : vision === "safe"
            ? "Safe harbour"
            : "Shared adventure";
  const conflictLabel =
    conflictSpeed === 1
      ? "Immediate processor"
      : conflictSpeed === 2
        ? "Engaged communicator"
        : conflictSpeed === 3
          ? "Situational responder"
          : conflictSpeed === 4
            ? "Thoughtful processor"
            : "Space-first processor";

  return {
    attachmentStyle: labelFromAttachmentAxis(attachmentAxis ?? ""),
    conflictStyle: conflictLabel,
    loveExpression: loveExpression.map((item) => loveLabels[item] ?? item).slice(0, 2).join(" + ") || "Balanced mix",
    relationshipVision: visionLabel
  };
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

  if (!isUiRouteEnabled("onboarding_results")) {
    return (
      <main className="app-main">
        <section className="app-shell">
          <div className="app-screen stack">
            <UiFallbackNotice
              title="Results refresh is temporarily paused"
              description="This visual module is currently gated while staged rollout metrics are monitored."
              primaryHref="/discover"
              primaryLabel="Open Discover"
              secondaryHref="/app"
              secondaryLabel="Back to Home"
            />
          </div>
          <BottomTabs current="home" />
        </section>
      </main>
    );
  }

  const snapshot = toSnapshotData(onboarding.compatibilityProfile, onboarding.attachmentAxis);

  return (
    <main className="app-main">
      <section className="app-shell">
        <div className="app-screen">
          <div className="stack">
            <section className="results-dna">
              <p className="eyebrow results-eyebrow">Your Relationship DNA</p>
              <h1 className="results-title">Your relationship DNA</h1>

              <div className="results-dna-grid" aria-label="Relationship DNA traits">
                <article className="results-dna-row">
                  <span>Attachment Style</span>
                  <strong>{snapshot.attachmentStyle}</strong>
                </article>
                <article className="results-dna-row">
                  <span>Conflict Style</span>
                  <strong>{snapshot.conflictStyle}</strong>
                </article>
                <article className="results-dna-row">
                  <span>Love Expression</span>
                  <strong>{snapshot.loveExpression}</strong>
                </article>
                <article className="results-dna-row">
                  <span>Relationship Vision</span>
                  <strong>{snapshot.relationshipVision}</strong>
                </article>
              </div>

              <p className="results-watermark">Built on Commitment Match</p>
            </section>

            <ShareSnapshotButton data={snapshot} appName="Commitment Match" />

            <section className="panel stack">
              <h2>What this means</h2>
              <p className="muted">
                Your profile is now calibrated for compatibility-first matching with transparent strengths and friction
                points.
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
