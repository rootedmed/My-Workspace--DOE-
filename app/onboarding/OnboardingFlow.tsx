"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { withCsrfHeaders } from "@/components/auth/csrf";
import {
  deriveAttachmentAxis,
  deriveReadinessScore,
  type ConflictSpeed,
  type EmotionalOpenness,
  type GrowthIntention,
  type LifestyleEnergy,
  type LoveExpression,
  type PastAttribution,
  type RelationshipVision,
  type RelationalStrength,
  type SupportNeed,
  type UserCompatibilityProfile
} from "@/lib/compatibility";

type QuestionType = "cards" | "spectrum" | "rank";

type QuestionOption<T extends string | number> = {
  label: string;
  desc: string;
  value: T;
};

type QuestionDef<T extends string | number> = {
  id: keyof OnboardingAnswers;
  dimension: string;
  dimensionColor: string;
  prompt: string;
  question: string;
  type: QuestionType;
  leftLabel?: string;
  rightLabel?: string;
  options: Array<QuestionOption<T>>;
  instruction?: string;
  maxSelect?: number;
  insight: string;
  isBonus?: boolean;
};

type OnboardingAnswers = {
  past_attribution?: PastAttribution;
  conflict_speed?: ConflictSpeed;
  love_expression?: LoveExpression[];
  support_need?: SupportNeed;
  emotional_openness?: EmotionalOpenness;
  relationship_vision?: RelationshipVision;
  relational_strengths?: RelationalStrength[];
  growth_intention?: GrowthIntention;
  lifestyle_energy?: LifestyleEnergy;
};

type ProgressResponse = {
  progress: {
    current_step: number;
    completed: boolean;
    total_steps: number;
    mode: "deep";
  };
  draft: Partial<OnboardingAnswers>;
};

const questions: Array<QuestionDef<string | number>> = [
  {
    id: "past_attribution",
    dimension: "Past Reflection",
    dimensionColor: "#C4865A",
    prompt: "First question. When a past relationship ended, what was really going on?",
    question: "When a past relationship ended, what do you feel was the core issue?",
    type: "cards",
    options: [
      { label: "Different directions", desc: "We wanted different things long-term", value: "misaligned_goals" },
      { label: "Communication", desc: "We struggled to talk through conflict", value: "conflict_comm" },
      { label: "Emotional distance", desc: "I felt unseen or disconnected", value: "emotional_disconnect" },
      { label: "Need for space", desc: "I needed more independence", value: "autonomy" },
      { label: "Timing & life", desc: "External circumstances got in the way", value: "external" }
    ],
    insight: "This reveals how you interpret your past — a window into growth and self-awareness."
  },
  {
    id: "conflict_speed",
    dimension: "Conflict Style",
    dimensionColor: "#D4607A",
    prompt: "Let's talk about fighting. Everyone does it — the question is how.",
    question: "In a disagreement with someone you love, what do you tend to do first?",
    type: "spectrum",
    leftLabel: "Talk it through immediately",
    rightLabel: "Need space to process first",
    options: [
      { label: "Talk now", value: 1, desc: "I want to resolve things in the moment" },
      { label: "Lean in", value: 2, desc: "I engage fairly quickly but warm up first" },
      { label: "Middle path", value: 3, desc: "Depends on the situation and my energy" },
      { label: "Step back", value: 4, desc: "I usually need a beat before I can engage well" },
      { label: "Space first", value: 5, desc: "I need significant time alone before I can talk" }
    ],
    insight: "Conflict style compatibility is one of the strongest predictors of relationship success."
  },
  {
    id: "love_expression",
    dimension: "Love Expression",
    dimensionColor: "#A06BB8",
    prompt: "How do you show someone you love them? (Not what you think you should say — what you actually do.)",
    question: "How do you naturally express love to someone you care about?",
    type: "rank",
    options: [
      { label: "Acts of care", desc: "Doing things to make their life easier", value: "acts" },
      { label: "Quality presence", desc: "Full, undivided attention and time", value: "time" },
      { label: "Words & affirmation", desc: "Saying exactly how I feel, often", value: "words" },
      { label: "Physical closeness", desc: "Touch, warmth, physical presence", value: "physical" },
      { label: "Thoughtful surprises", desc: "Gestures that show I was thinking of them", value: "gifts" }
    ],
    instruction: "Pick your top 2",
    maxSelect: 2,
    insight: "We match on expression patterns and emotional responsiveness, not just language labels."
  },
  {
    id: "support_need",
    dimension: "Support Needs",
    dimensionColor: "#5A8FC4",
    prompt: "When life gets hard and you're stressed, what do you need from a partner?",
    question: "When you're stressed or going through something hard, what do you need from a partner?",
    type: "cards",
    options: [
      { label: "Just listen", desc: "I need to feel heard, not fixed", value: "validation" },
      { label: "Help me solve it", desc: "Take something off my plate", value: "practical" },
      { label: "Be close", desc: "Physical presence and warmth", value: "presence" },
      { label: "Give me space", desc: "Then gently check in later", value: "space" },
      { label: "Distract me", desc: "Help me get out of my head", value: "distraction" }
    ],
    insight: "Support style mismatch breaks couples who deeply love each other."
  },
  {
    id: "emotional_openness",
    dimension: "Emotional Openness",
    dimensionColor: "#6BA89E",
    prompt: "Real talk: How comfortable are you with emotional vulnerability in a relationship?",
    question: "How comfortable are you with emotional vulnerability in a relationship?",
    type: "spectrum",
    leftLabel: "Very open — I share deeply",
    rightLabel: "More private — I keep things close",
    options: [
      { label: "Very open", value: 1, desc: "I share naturally and crave emotional depth" },
      { label: "Open with trust", value: 2, desc: "I open up slowly but fully once safe" },
      { label: "Working on it", value: 3, desc: "I want more openness than comes naturally" },
      { label: "Selective", value: 4, desc: "I'm private but can open up with the right person" },
      { label: "Self-contained", value: 5, desc: "I prefer to manage most emotions internally" }
    ],
    insight: "Emotional availability explains more relationship satisfaction than any other single factor."
  },
  {
    id: "relationship_vision",
    dimension: "Relationship Vision",
    dimensionColor: "#C4A85A",
    prompt: "What does a truly healthy relationship look like to you — not in theory, in everyday life?",
    question: "What does a truly healthy relationship look like to you in everyday life?",
    type: "cards",
    options: [
      { label: "Independent together", desc: "Two whole people who actively choose each other", value: "independent" },
      { label: "Deeply intertwined", desc: "Each other's anchor through everything", value: "enmeshed" },
      { label: "Best friendship", desc: "Deep friendship with romantic depth", value: "friendship" },
      { label: "Safe harbour", desc: "A calm, peaceful space from the world", value: "safe" },
      { label: "Shared adventure", desc: "Growing, building, exploring together", value: "adventure" }
    ],
    insight: "Goal alignment predicts relationship success above personality compatibility."
  },
  {
    id: "relational_strengths",
    dimension: "Self-Awareness",
    dimensionColor: "#8FA65A",
    prompt:
      "Looking back, what did you bring to past relationships that you're genuinely proud of? (And don't say nothing — we won't believe you.)",
    question: "Looking back, what did you bring to past relationships that you're genuinely proud of?",
    type: "rank",
    options: [
      { label: "Consistency", desc: "I show up and follow through", value: "consistency" },
      { label: "Loyalty", desc: "People feel safe and secure with me", value: "loyalty" },
      { label: "Honesty", desc: "I communicate openly, even when it's hard", value: "honesty" },
      { label: "Joy", desc: "I bring lightness, laughter, and spontaneity", value: "joy" },
      { label: "Championing", desc: "I cheer for people's growth and dreams", value: "support" }
    ],
    instruction: "Pick your top 2",
    maxSelect: 2,
    insight: "Self-compassion is a significant predictor of relationship quality for both partners."
  },
  {
    id: "growth_intention",
    dimension: "Growth Intention",
    dimensionColor: "#B86B8A",
    prompt: "Last one. What's the one thing you most want to be different in your next relationship?",
    question: "What's the one thing you most want to be different in your next relationship?",
    type: "cards",
    options: [
      { label: "Deeper honesty", desc: "More emotional depth and real communication", value: "depth" },
      { label: "Better balance", desc: "Togetherness and personal space in harmony", value: "balance" },
      { label: "Being chosen", desc: "A partner who actively picks me, consistently", value: "chosen" },
      { label: "Less conflict", desc: "More calm, more mutual respect", value: "peace" },
      { label: "Real alignment", desc: "Same vision for life and what we're building", value: "alignment" }
    ],
    insight: "This is your growth signal — it tells us exactly what you've learned and what you're ready for."
  },
  {
    id: "lifestyle_energy",
    dimension: "Lifestyle",
    dimensionColor: "#C4865A",
    prompt: "Bonus question: If your ideal Saturday night was a movie genre, what would it be?",
    question: "If your ideal Saturday night was a movie genre, what would it be?",
    type: "cards",
    options: [
      { label: "Quiet indie film", desc: "Calm, introspective, small gathering", value: "introspective" },
      { label: "Action blockbuster", desc: "High energy, excitement, stimulation", value: "high_energy" },
      { label: "Rom-com marathon", desc: "Lighthearted, social, laughter-filled", value: "social" },
      { label: "Documentary deep-dive", desc: "Curious, learning-focused, engaged", value: "intellectual" },
      { label: "Whatever's playing", desc: "Spontaneous, go-with-the-flow, adaptable", value: "spontaneous" }
    ],
    insight: "This helps us match you with people whose energy level fits yours.",
    isBonus: true
  }
];

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = (current / total) * 100;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100 }}>
      <div style={{ height: "3px", background: "rgba(255,255,255,0.08)" }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: "linear-gradient(90deg, #C4865A, #D4607A, #A06BB8)",
            transition: "width 0.6s cubic-bezier(0.4,0,0.2,1)"
          }}
        />
      </div>
    </div>
  );
}

function DimensionPill({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "4px 12px",
        borderRadius: "20px",
        background: `${color}20`,
        border: `1px solid ${color}50`,
        color,
        fontSize: "11px",
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        marginBottom: "20px"
      }}
    >
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
      {label}
    </div>
  );
}

function CardOption({
  option,
  selected,
  onClick,
  disabled
}: {
  option: QuestionOption<string | number>;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabled && !selected)}
      style={{
        background: selected ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.04)",
        border: selected ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.08)",
        borderRadius: "14px",
        padding: "14px 18px",
        cursor: disabled && !selected ? "not-allowed" : "pointer",
        transition: "all 0.2s ease",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: "14px",
        opacity: disabled && !selected ? 0.4 : 1,
        transform: selected ? "scale(1.01)" : "scale(1)",
        width: "100%"
      }}
    >
      <div>
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 600,
            fontSize: "14px",
            color: selected ? "#fff" : "rgba(255,255,255,0.85)",
            marginBottom: "2px"
          }}
        >
          {option.label}
        </div>
        <div
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "12px",
            color: "rgba(255,255,255,0.45)",
            lineHeight: 1.4
          }}
        >
          {option.desc}
        </div>
      </div>
      {selected ? (
        <div
          style={{
            marginLeft: "auto",
            flexShrink: 0,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        />
      ) : null}
    </button>
  );
}

function SpectrumQuestion({
  q,
  value,
  onChange
}: {
  q: QuestionDef<string | number>;
  value?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "14px" }}>
        <span
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.4)",
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: "40%"
          }}
        >
          {q.leftLabel}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.4)",
            fontFamily: "'DM Sans', sans-serif",
            textAlign: "right",
            maxWidth: "40%"
          }}
        >
          {q.rightLabel}
        </span>
      </div>
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        {q.options.map((opt) => (
          <button
            key={`${q.id}-${String(opt.value)}`}
            type="button"
            onClick={() => onChange(Number(opt.value))}
            style={{
              flex: 1,
              padding: "14px 4px",
              borderRadius: "12px",
              border:
                value === Number(opt.value)
                  ? "1px solid rgba(255,255,255,0.4)"
                  : "1px solid rgba(255,255,255,0.08)",
              background: value === Number(opt.value) ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
              cursor: "pointer",
              transition: "all 0.2s ease",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px"
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: value === Number(opt.value) ? q.dimensionColor : "rgba(255,255,255,0.08)",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "12px",
                fontWeight: 700,
                color: "#fff",
                fontFamily: "'DM Sans', sans-serif"
              }}
            >
              {opt.value}
            </div>
          </button>
        ))}
      </div>
      {value ? (
        <div
          style={{
            background: "rgba(255,255,255,0.05)",
            borderRadius: "12px",
            padding: "14px 16px",
            border: "1px solid rgba(255,255,255,0.08)"
          }}
        >
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "13px", color: "rgba(255,255,255,0.7)" }}>
            {q.options.find((o) => Number(o.value) === value)?.desc}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RankQuestion({
  q,
  selected,
  onToggle
}: {
  q: QuestionDef<string | number>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const max = q.maxSelect || 2;
  return (
    <div>
      <div
        style={{
          marginBottom: "12px",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "12px",
          color: "rgba(255,255,255,0.4)",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}
      >
        <span
          style={{
            background: selected.length >= max ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
            borderRadius: "20px",
            padding: "3px 10px",
            color: selected.length >= max ? "#fff" : "rgba(255,255,255,0.4)"
          }}
        >
          {selected.length}/{max} selected
        </span>
        {q.instruction}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {q.options.map((opt) => {
          const optValue = String(opt.value);
          const isSelected = selected.includes(optValue);
          const isDisabled = !isSelected && selected.length >= max;
          return (
            <CardOption
              key={`${q.id}-${optValue}`}
              option={opt}
              selected={isSelected}
              onClick={() => onToggle(optValue)}
              disabled={isDisabled}
            />
          );
        })}
      </div>
    </div>
  );
}

function InsightBubble({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: "16px",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "10px",
        padding: "10px 14px",
        display: "flex",
        gap: "10px",
        alignItems: "flex-start"
      }}
    >
      <div
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "11.5px",
          color: "rgba(255,255,255,0.38)",
          lineHeight: 1.6,
          fontStyle: "italic"
        }}
      >
        {text}
      </div>
    </div>
  );
}

function getLivePreviewText(answers: OnboardingAnswers): string {
  const traits: string[] = [];
  const loveSet = new Set(answers.love_expression ?? []);
  if (loveSet.has("time")) traits.push("value quality presence");
  if (loveSet.has("acts")) traits.push("show care through practical support");
  if (loveSet.has("words")) traits.push("communicate feelings clearly");
  if (answers.relationship_vision === "adventure") traits.push("want a relationship that feels like a shared adventure");
  if (answers.relationship_vision === "safe") traits.push("prefer a calm, stable relationship rhythm");

  if (traits.length === 0) {
    return "Based on your answers so far, you're most compatible with people who match your emotional pacing and support style.";
  }
  if (traits.length === 1) {
    return `Based on your answers so far, you're most compatible with people who ${traits[0]}.`;
  }
  return `Based on your answers so far, you're most compatible with people who ${traits[0]} and ${traits[1]}.`;
}

function LivePreview({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: "14px",
        background: "rgba(196, 134, 90, 0.14)",
        border: "1px solid rgba(196, 134, 90, 0.35)",
        borderRadius: "12px",
        padding: "12px 14px",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: "12px",
        color: "rgba(255,255,255,0.82)",
        lineHeight: 1.5
      }}
    >
      {text} Let&apos;s keep going.
    </div>
  );
}

function SummaryScreen({
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
      q: "Q6, Q7, Q8, Q9"
    }
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f0e0e",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        textAlign: "center"
      }}
    >
      <div style={{ maxWidth: 420, width: "100%" }}>
        <h1
          style={{
            fontFamily: "'DM Serif Display', Georgia, serif",
            fontSize: "32px",
            color: "#fff",
            fontWeight: 400,
            margin: "0 0 12px 0",
            lineHeight: 1.2
          }}
        >
          Your compatibility
          <br />
          profile is ready.
        </h1>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "14px",
            color: "rgba(255,255,255,0.4)",
            marginBottom: "40px"
          }}
        >
          Here&apos;s what we learned about you across three dimensions.
        </p>

        {dims.map((d) => (
          <div
            key={d.label}
            style={{
              background: "rgba(255,255,255,0.04)",
              borderRadius: "14px",
              padding: "18px 20px",
              marginBottom: "12px",
              border: "1px solid rgba(255,255,255,0.07)",
              textAlign: "left"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
              <div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600,
                    fontSize: "13px",
                    color: "#fff"
                  }}
                >
                  {d.label}
                </div>
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.3)",
                    marginTop: "2px"
                  }}
                >
                  From {d.q}
                </div>
              </div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: "22px", color: d.color }}>
                {Math.round(d.score)}
              </div>
            </div>
            <div style={{ height: "4px", background: "rgba(255,255,255,0.06)", borderRadius: "2px" }}>
              <div
                style={{
                  height: "100%",
                  width: `${Math.round(d.score)}%`,
                  background: d.color,
                  borderRadius: "2px",
                  transition: "width 1s ease"
                }}
              />
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={onContinue}
          style={{
            width: "100%",
            marginTop: "20px",
            background: "linear-gradient(135deg, #C4865A, #D4607A, #A06BB8)",
            border: "none",
            borderRadius: "14px",
            padding: "16px",
            color: "#fff",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: "15px",
            fontWeight: 700,
            cursor: "pointer",
            letterSpacing: "0.02em",
            boxShadow: "0 8px 32px rgba(196, 134, 90, 0.3)"
          }}
        >
          Find my matches
        </button>
      </div>
    </div>
  );
}

function hasAnswer(answer: OnboardingAnswers[keyof OnboardingAnswers] | undefined): boolean {
  if (Array.isArray(answer)) {
    return answer.length > 0;
  }
  return answer !== undefined && answer !== null;
}

export function OnboardingFlow({
  userId,
  onComplete
}: {
  userId: string;
  onComplete?: (profile: UserCompatibilityProfile) => void;
}) {
  const router = useRouter();
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<OnboardingAnswers>({});
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const q = questions[currentQ]!;

  const readyForNext = hasAnswer(answers[q.id]);

  const completedProfile = useMemo<UserCompatibilityProfile | null>(() => {
    if (
      !answers.past_attribution ||
      !answers.conflict_speed ||
      !answers.love_expression ||
      !answers.support_need ||
      !answers.emotional_openness ||
      !answers.relationship_vision ||
      !answers.relational_strengths ||
      !answers.growth_intention ||
      !answers.lifestyle_energy
    ) {
      return null;
    }

    const baseProfile = {
      userId,
      past_attribution: answers.past_attribution,
      conflict_speed: answers.conflict_speed,
      love_expression: answers.love_expression,
      support_need: answers.support_need,
      emotional_openness: answers.emotional_openness,
      relationship_vision: answers.relationship_vision,
      relational_strengths: answers.relational_strengths,
      growth_intention: answers.growth_intention,
      lifestyle_energy: answers.lifestyle_energy,
      attachment_axis: "secure" as const,
      completedAt: new Date()
    };

    const attachmentAxis = deriveAttachmentAxis({
      ...baseProfile,
      readiness_score: 0
    });
    const readiness = deriveReadinessScore({
      ...baseProfile,
      attachment_axis: attachmentAxis
    });

    return {
      ...baseProfile,
      attachment_axis: attachmentAxis,
      readiness_score: readiness
    };
  }, [answers, userId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/onboarding/progress", { cache: "no-store" });
      if (!response.ok) {
        if (!cancelled) {
          setError("Could not load onboarding progress.");
          setLoading(false);
        }
        return;
      }

      const payload = (await response.json()) as ProgressResponse;
      if (cancelled) return;

      const draft = payload.draft ?? {};
      setAnswers({
        past_attribution: draft.past_attribution as PastAttribution | undefined,
        conflict_speed: draft.conflict_speed as ConflictSpeed | undefined,
        love_expression: draft.love_expression as LoveExpression[] | undefined,
        support_need: draft.support_need as SupportNeed | undefined,
        emotional_openness: draft.emotional_openness as EmotionalOpenness | undefined,
        relationship_vision: draft.relationship_vision as RelationshipVision | undefined,
        relational_strengths: draft.relational_strengths as RelationalStrength[] | undefined,
        growth_intention: draft.growth_intention as GrowthIntention | undefined,
        lifestyle_energy: draft.lifestyle_energy as LifestyleEnergy | undefined
      });
      setCurrentQ(Math.max(0, Math.min((payload.progress.current_step ?? 1) - 1, questions.length - 1)));
      setDone(Boolean(payload.progress.completed));
      setLoading(false);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleAnswer(value: string | number | string[]) {
    setAnswers((prev) => ({ ...prev, [q.id]: value }));
  }

  async function persistStep(nextStep: number, value: string | number | string[]) {
    const response = await fetch("/api/onboarding/answer", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        questionId: q.id,
        value,
        currentStep: currentQ + 1,
        nextStep,
        totalSteps: questions.length,
        mode: "deep"
      })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not save answer.");
    }
  }

  async function goNext() {
    if (!readyForNext) return;
    const value = answers[q.id];
    if (value === undefined) return;

    setSaving(true);
    setError(null);

    try {
      const nextStep = Math.min(questions.length, currentQ + 2);
      await persistStep(nextStep, value as string | number | string[]);

      if (currentQ < questions.length - 1) {
        setCurrentQ((prev) => prev + 1);
      } else {
        setDone(true);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save answer.");
    } finally {
      setSaving(false);
    }
  }

  async function completeOnboarding() {
    if (!completedProfile || saving) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          past_attribution: completedProfile.past_attribution,
          conflict_speed: completedProfile.conflict_speed,
          love_expression: completedProfile.love_expression,
          support_need: completedProfile.support_need,
          emotional_openness: completedProfile.emotional_openness,
          relationship_vision: completedProfile.relationship_vision,
          relational_strengths: completedProfile.relational_strengths,
          growth_intention: completedProfile.growth_intention,
          lifestyle_energy: completedProfile.lifestyle_energy
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not complete onboarding.");
      }

      onComplete?.(completedProfile);
      router.push("/results");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete onboarding.");
    } finally {
      setSaving(false);
    }
  }

  async function goBack() {
    if (currentQ > 0) {
      const previousStep = currentQ;
      setCurrentQ((prev) => prev - 1);
      await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          currentStep: previousStep,
          totalSteps: questions.length,
          mode: "deep",
          completed: false
        })
      }).catch(() => undefined);
    }
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0f0e0e", display: "grid", placeItems: "center", color: "#fff" }}>
        Loading onboarding...
      </div>
    );
  }

  if (done && completedProfile) {
    return (
      <SummaryScreen
        profile={completedProfile}
        onContinue={() => {
          void completeOnboarding();
        }}
      />
    );
  }

  return (
    <div>
      <ProgressBar current={currentQ + 1} total={questions.length} />
      <div
        style={{
          position: "fixed",
          top: "12px",
          right: "16px",
          zIndex: 101,
          fontFamily: "'DM Sans', sans-serif",
          fontSize: "12px",
          color: "rgba(255,255,255,0.25)"
        }}
      >
        {currentQ + 1} / {questions.length}
      </div>

      <div
        key={q.id}
        style={{
          minHeight: "100vh",
          background: "#0f0e0e",
          display: "flex",
          flexDirection: "column",
          padding: "60px 24px 30px",
          animation: "questionEnter 0.4s ease"
        }}
      >
        <div style={{ maxWidth: 480, margin: "0 auto", width: "100%", flex: 1, display: "flex", flexDirection: "column" }}>
          <DimensionPill label={q.dimension} color={q.dimensionColor} />

          <div
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: "13px",
              color: "rgba(255,255,255,0.35)",
              marginBottom: "10px",
              letterSpacing: "0.01em"
            }}
          >
            {q.prompt}
          </div>
          {q.isBonus ? (
            <div
              style={{
                display: "inline-flex",
                width: "fit-content",
                marginBottom: "12px",
                borderRadius: "999px",
                padding: "4px 10px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.06)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "11px",
                color: "rgba(255,255,255,0.72)",
                letterSpacing: "0.06em",
                textTransform: "uppercase"
              }}
            >
              Bonus Question
            </div>
          ) : null}

          <h2
            style={{
              fontFamily: "'DM Serif Display', Georgia, serif",
              fontSize: "clamp(20px, 5vw, 26px)",
              color: "#fff",
              fontWeight: 400,
              lineHeight: 1.35,
              margin: "0 0 28px 0",
              letterSpacing: "-0.01em"
            }}
          >
            {q.question}
          </h2>

          <div style={{ flex: 1 }}>
            {q.type === "cards" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {q.options.map((opt) => (
                  <CardOption
                    key={`${q.id}-${String(opt.value)}`}
                    option={opt}
                    selected={answers[q.id] === opt.value}
                    onClick={() => handleAnswer(String(opt.value))}
                  />
                ))}
              </div>
            ) : null}

            {q.type === "spectrum" ? (
              <SpectrumQuestion
                q={q}
                value={answers[q.id] as number | undefined}
                onChange={(value) => handleAnswer(value)}
              />
            ) : null}

            {q.type === "rank" ? (
              <RankQuestion
                q={q}
                selected={(answers[q.id] as string[] | undefined) ?? []}
                onToggle={(value) => {
                  const current = ((answers[q.id] as string[] | undefined) ?? []).slice();
                  if (current.includes(value)) {
                    handleAnswer(current.filter((v) => v !== value));
                    return;
                  }
                  if (current.length < (q.maxSelect ?? 2)) {
                    handleAnswer([...current, value]);
                  }
                }}
              />
            ) : null}

            <InsightBubble text={q.insight} />
            {currentQ >= 3 ? <LivePreview text={getLivePreviewText(answers)} /> : null}
            {error ? (
              <p style={{ marginTop: "14px", color: "#ffb0b0", fontFamily: "'DM Sans', sans-serif", fontSize: "12px" }}>
                {error}
              </p>
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: "32px",
              paddingTop: "20px",
              borderTop: "1px solid rgba(255,255,255,0.06)"
            }}
          >
            <button
              type="button"
              onClick={() => void goBack()}
              disabled={currentQ === 0 || saving}
              style={{
                background: "transparent",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "12px",
                padding: "12px 20px",
                color: currentQ === 0 ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.5)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "13px",
                cursor: currentQ === 0 ? "not-allowed" : "pointer",
                transition: "all 0.2s"
              }}
            >
              Back
            </button>

            <button
              type="button"
              onClick={() => void goNext()}
              disabled={!readyForNext || saving}
              style={{
                background: readyForNext
                  ? `linear-gradient(135deg, ${q.dimensionColor}, ${q.dimensionColor}cc)`
                  : "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: "12px",
                padding: "12px 28px",
                color: readyForNext ? "#fff" : "rgba(255,255,255,0.2)",
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "13px",
                fontWeight: 600,
                cursor: readyForNext ? "pointer" : "not-allowed",
                transition: "all 0.25s ease",
                boxShadow: readyForNext ? `0 4px 20px ${q.dimensionColor}40` : "none"
              }}
            >
              {saving ? "Saving..." : currentQ === questions.length - 1 ? "See my matches" : "Continue"}
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes questionEnter {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
