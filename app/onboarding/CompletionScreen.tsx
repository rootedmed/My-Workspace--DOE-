import type { UserCompatibilityProfile } from "@/lib/compatibility";
import styles from "./OnboardingFlow.module.css";

export function CompletionScreen({
  profile,
  onContinue
}: {
  profile: UserCompatibilityProfile;
  onContinue: () => void;
}) {
  const dims = [
    {
      label: "Attachment Profile",
      score: Math.max(0, 100 - Math.abs(profile.emotional_openness - 3) * 18),
      color: "#A06BB8",
      q: "Q3, Q4, Q5"
    },
    {
      label: "Conflict & Communication",
      score: Math.max(0, 100 - Math.abs(profile.conflict_speed - 3) * 18),
      color: "#D4607A",
      q: "Q1, Q2"
    },
    {
      label: "Relational Vision",
      score: profile.readiness_score,
      color: "#6BA89E",
      q: "Q6, Q7, Q8"
    }
  ];

  return (
    <div className={styles.summary}>
      <div className={styles.summaryInner}>
        <h1 className={styles.summaryTitle}>
          Your compatibility
          <br />
          profile is ready.
        </h1>
        <p className={styles.summarySub}>
          Here&apos;s what we learned about you across three dimensions.
        </p>

        {dims.map((d) => (
          <div key={d.label} className={styles.summaryCard}>
            <div className={styles.summaryCardHead}>
              <div>
                <div className={styles.summaryLabel}>{d.label}</div>
                <div className={styles.summaryFrom}>From {d.q}</div>
              </div>
              <div className={styles.summaryScore} style={{ color: d.color }}>
                {Math.round(d.score)}
              </div>
            </div>
            <div className={styles.summaryTrack}>
              <div className={styles.summaryBar} style={{ width: `${Math.round(d.score)}%`, background: d.color }} />
            </div>
          </div>
        ))}

        <button type="button" className={styles.summaryAction} onClick={onContinue}>
          Find my matches
        </button>
      </div>
    </div>
  );
}

