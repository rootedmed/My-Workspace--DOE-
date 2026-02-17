import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import type { OnboardingProfile } from "@/lib/domain/types";

type TraitCard = {
  label: string;
  value: string;
  blurb: string;
};

function toTraitCards(profile: OnboardingProfile): TraitCard[] {
  const emotionalPace =
    profile.intent.timelineMonths >= 20
      ? { value: "Slow and intentional", blurb: "You prefer trust first, then momentum." }
      : profile.intent.timelineMonths >= 12
        ? { value: "Balanced pace", blurb: "You like steady emotional momentum." }
        : { value: "Fast momentum", blurb: "You feel best with clear early movement." };

  const conflictStyle =
    profile.tendencies.conflictRepair >= 70
      ? { value: "Gentle repair", blurb: "You lean toward calm recovery after tension." }
      : profile.tendencies.conflictRepair >= 45
        ? { value: "Direct then repair", blurb: "You value clarity, then reconnection." }
        : { value: "Cooldown first", blurb: "You usually need space before reconnecting." };

  const reassuranceNeeds =
    profile.tendencies.attachmentAnxiety >= 65
      ? { value: "High", blurb: "Consistency and explicit reassurance matter to you." }
      : profile.tendencies.attachmentAnxiety >= 40
        ? { value: "Moderate", blurb: "You appreciate reassurance during uncertainty." }
        : { value: "Low", blurb: "You generally feel stable without frequent reassurance." };

  const socialEnergy =
    profile.personality.extraversion >= 65
      ? { value: "High", blurb: "You tend to enjoy social momentum and activity." }
      : profile.personality.extraversion >= 40
        ? { value: "Balanced", blurb: "You balance social time and quieter recharge." }
        : { value: "Calm", blurb: "You often prefer lower-stimulation connection." };

  const lifestyleRhythm =
    profile.tendencies.noveltyPreference >= 65
      ? { value: "Spontaneous", blurb: "You like flexibility and variety." }
      : profile.tendencies.noveltyPreference >= 40
        ? { value: "Balanced", blurb: "You like routine with room for change." }
        : { value: "Structured", blurb: "You feel best with predictable rhythm." };

  return [
    { label: "Emotional Pace", ...emotionalPace },
    { label: "Conflict Style", ...conflictStyle },
    { label: "Reassurance Needs", ...reassuranceNeeds },
    { label: "Social Energy", ...socialEnergy },
    { label: "Lifestyle Rhythm", ...lifestyleRhythm }
  ];
}

function getMeaningText(profile: OnboardingProfile): string {
  const readiness = profile.intent.readiness >= 4 ? "ready for real momentum" : "intentional about pacing";
  const rhythm = profile.intent.weeklyCapacity >= 3 ? "consistent time for connection" : "focused quality time";
  return `You are ${readiness} and do best with ${rhythm}. The strongest matches for you will feel emotionally clear, compatible in rhythm, and easy to repair with after tension.`;
}

export default async function ResultsPage() {
  const user = await getCurrentUser();
  if (!user?.id) {
    redirect("/login");
  }

  const profile = await db.getProfile(user.id);
  if (!profile) {
    redirect("/app");
  }

  const cards = toTraitCards(profile);
  const meaning = getMeaningText(profile);

  return (
    <main>
      <section className="panel elevated stack">
        <p className="eyebrow">Dating Style Snapshot</p>
        <h1>Here&apos;s your relationship style</h1>
        <p className="muted">A quick read on how you naturally connect.</p>
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
        <p className="muted">{meaning}</p>
        <Link className="button-link" href="/discover">
          See compatible matches
        </Link>
      </section>
    </main>
  );
}
