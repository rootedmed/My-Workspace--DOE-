"use client";

import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { trackUxEvent } from "@/lib/observability/uxClient";
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
    dimensionColor: "#BA4E3D",
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
    insight: "This reveals how you interpret your past, which is a direct signal of growth readiness."
  },
  {
    id: "conflict_speed",
    dimension: "Conflict Style",
    dimensionColor: "#AF6B2D",
    prompt: "Let's talk about fighting. Everyone does it - the question is how.",
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
    insight: "Conflict style compatibility is one of the strongest predictors of relationship durability."
  },
  {
    id: "love_expression",
    dimension: "Love Expression",
    dimensionColor: "#2E8E65",
    prompt: "How do you show someone you love them? Not what you should say - what you naturally do.",
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
    insight: "We match on expression patterns and emotional responsiveness, not just labels."
  },
  {
    id: "support_need",
    dimension: "Support Needs",
    dimensionColor: "#4A7A8D",
    prompt: "When life gets hard and stress spikes, what do you need most from your partner?",
    question: "When you're stressed or going through something hard, what do you need from a partner?",
    type: "cards",
    options: [
      { label: "Just listen", desc: "I need to feel heard, not fixed", value: "validation" },
      { label: "Help me solve it", desc: "Take something off my plate", value: "practical" },
      { label: "Be close", desc: "Physical presence and warmth", value: "presence" },
      { label: "Give me space", desc: "Then gently check in later", value: "space" },
      { label: "Distract me", desc: "Help me get out of my head", value: "distraction" }
    ],
    insight: "Support mismatch can create friction even when emotional chemistry is strong."
  },
  {
    id: "emotional_openness",
    dimension: "Emotional Openness",
    dimensionColor: "#8D6B4F",
    prompt: "Real talk: how comfortable are you with emotional vulnerability in a relationship?",
    question: "How comfortable are you with emotional vulnerability in a relationship?",
    type: "spectrum",
    leftLabel: "Very open - I share deeply",
    rightLabel: "More private - I keep things close",
    options: [
      { label: "Very open", value: 1, desc: "I share naturally and crave emotional depth" },
      { label: "Open with trust", value: 2, desc: "I open up slowly but fully once safe" },
      { label: "Working on it", value: 3, desc: "I want more openness than comes naturally" },
      { label: "Selective", value: 4, desc: "I'm private but can open up with the right person" },
      { label: "Self-contained", value: 5, desc: "I prefer to manage most emotions internally" }
    ],
    insight: "Emotional availability is one of the most powerful predictors of relationship satisfaction."
  },
  {
    id: "relationship_vision",
    dimension: "Relationship Vision",
    dimensionColor: "#E06A56",
    prompt: "What does a healthy relationship look like to you in ordinary everyday life?",
    question: "What does a truly healthy relationship look like to you in everyday life?",
    type: "cards",
    options: [
      { label: "Independent together", desc: "Two whole people who actively choose each other", value: "independent" },
      { label: "Deeply intertwined", desc: "Each other's anchor through everything", value: "enmeshed" },
      { label: "Best friendship", desc: "Deep friendship with romantic depth", value: "friendship" },
      { label: "Safe harbour", desc: "A calm, peaceful space from the world", value: "safe" },
      { label: "Shared adventure", desc: "Growing, building, and exploring together", value: "adventure" }
    ],
    insight: "Goal alignment predicts long-term success more than surface-level personality matching."
  },
  {
    id: "relational_strengths",
    dimension: "Self-Awareness",
    dimensionColor: "#6F7B56",
    prompt:
      "What did you bring to past relationships that you're genuinely proud of? And don't say nothing - we won't believe you.",
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
    insight: "Self-compassion and self-awareness are both linked to stronger partnerships."
  },
  {
    id: "growth_intention",
    dimension: "Growth Intention",
    dimensionColor: "#BA4E3D",
    prompt: "Last one: what's the one thing you most want to be different next time?",
    question: "What's the one thing you most want to be different in your next relationship?",
    type: "cards",
    options: [
      { label: "Deeper honesty", desc: "More emotional depth and real communication", value: "depth" },
      { label: "Better balance", desc: "Togetherness and personal space in harmony", value: "balance" },
      { label: "Being chosen", desc: "A partner who actively picks me, consistently", value: "chosen" },
      { label: "Less conflict", desc: "More calm, more mutual respect", value: "peace" },
      { label: "Real alignment", desc: "Same vision for life and what we're building", value: "alignment" }
    ],
    insight: "This is your growth signal and helps us weight what matters most for your next chapter."
  },
  {
    id: "lifestyle_energy",
    dimension: "Lifestyle",
    dimensionColor: "#2E8E65",
    prompt: "Bonus question: if your ideal Saturday night was a movie genre, what would it be?",
    question: "If your ideal Saturday night was a movie genre, what would it be?",
    type: "cards",
    options: [
      { label: "Quiet indie film", desc: "Calm, introspective, small gathering", value: "introspective" },
      { label: "Action blockbuster", desc: "High energy, excitement, stimulation", value: "high_energy" },
      { label: "Rom-com marathon", desc: "Lighthearted, social, laughter-filled", value: "social" },
      { label: "Documentary deep-dive", desc: "Curious, learning-focused, engaged", value: "intellectual" },
      { label: "Whatever's playing", desc: "Spontaneous, go-with-the-flow, adaptable", value: "spontaneous" }
    ],
    insight: "Lifestyle pace is a major compatibility layer that often gets ignored on dating apps.",
    isBonus: true
  }
];

function hasAnswer(answer: OnboardingAnswers[keyof OnboardingAnswers] | undefined): boolean {
  if (Array.isArray(answer)) {
    return answer.length > 0;
  }
  return answer !== undefined && answer !== null;
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

function DimensionPill({ label, color }: { label: string; color: string }) {
  return (
    <div className="onboarding-dimension-pill" style={{ "--dimension-color": color } as CSSProperties}>
      <span className="onboarding-dimension-dot" aria-hidden="true" />
      {label}
    </div>
  );
}

function CardOption({
  option,
  selected,
  onClick,
  disabled = false
}: {
  option: QuestionOption<string | number>;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`onboarding-option${selected ? " active" : ""}`}
      onClick={onClick}
      disabled={disabled && !selected}
      aria-pressed={selected}
    >
      <span className="onboarding-option-content">
        <strong>{option.label}</strong>
        <span>{option.desc}</span>
      </span>
      <span className={`onboarding-option-check${selected ? " active" : ""}`} aria-hidden="true" />
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
  const selected = q.options.find((opt) => Number(opt.value) === value);

  return (
    <div className="onboarding-spectrum">
      <div className="onboarding-spectrum-labels">
        <span>{q.leftLabel}</span>
        <span>{q.rightLabel}</span>
      </div>
      <div className="onboarding-spectrum-grid" role="radiogroup" aria-label={q.question}>
        {q.options.map((opt) => {
          const optionValue = Number(opt.value);
          const isSelected = value === optionValue;
          return (
            <button
              key={`${q.id}-${String(opt.value)}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`onboarding-scale-button${isSelected ? " active" : ""}`}
              onClick={() => onChange(optionValue)}
            >
              <span className="onboarding-scale-number">{opt.value}</span>
              <span className="onboarding-scale-label">{opt.label}</span>
            </button>
          );
        })}
      </div>
      {selected ? <p className="onboarding-helper">{selected.desc}</p> : null}
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
    <div className="stack">
      <p className="onboarding-helper">
        <strong>{selected.length}/{max}</strong> selected{q.instruction ? ` - ${q.instruction}` : ""}
      </p>
      <div className="stack">
        {q.options.map((opt) => {
          const value = String(opt.value);
          const isSelected = selected.includes(value);
          const isDisabled = !isSelected && selected.length >= max;
          return (
            <CardOption
              key={`${q.id}-${value}`}
              option={opt}
              selected={isSelected}
              onClick={() => onToggle(value)}
              disabled={isDisabled}
            />
          );
        })}
      </div>
    </div>
  );
}

function SummaryScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <section className="onboarding-summary panel stack">
      <p className="eyebrow">Your Relationship DNA</p>
      <h1>Your profile is complete.</h1>
      <p className="muted">
        We now have enough signal to show matches with meaningful fit and clear coaching guidance.
      </p>
      <div className="onboarding-summary-grid">
        <article className="prompt-card">
          <h3>Emotional style</h3>
          <p className="small">Matched on openness rhythm, support needs, and attachment pacing.</p>
        </article>
        <article className="prompt-card">
          <h3>Conflict rhythm</h3>
          <p className="small">You will see where conflict speed naturally aligns and where it needs structure.</p>
        </article>
        <article className="prompt-card">
          <h3>Life direction</h3>
          <p className="small">Vision and growth intent are prioritized over shallow profile noise.</p>
        </article>
      </div>
      <div className="actions">
        <button type="button" onClick={onContinue}>Continue to profile setup</button>
      </div>
    </section>
  );
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

  const q = questions[currentQ] ?? questions[0]!;
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

  useEffect(() => {
    if (loading) return;
    trackUxEvent("onboarding_step_viewed", { step: currentQ + 1 });
  }, [currentQ, loading]);

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
      trackUxEvent("onboarding_step_saved", { step: currentQ + 1 });

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
      trackUxEvent("onboarding_completed");
      router.push("/profile/setup");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete onboarding.");
    } finally {
      setSaving(false);
    }
  }

  async function goBack() {
    if (currentQ === 0) return;

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

  if (loading) {
    return (
      <main className="public-main onboarding-main">
        <section className="panel">
          <p className="muted">Loading onboarding...</p>
        </section>
      </main>
    );
  }

  if (done && completedProfile) {
    return (
      <main className="public-main onboarding-main">
        <SummaryScreen
          onContinue={() => {
            void completeOnboarding();
          }}
        />
      </main>
    );
  }

  return (
    <main className="public-main onboarding-main">
      <section className="onboarding-shell">
        <section className="panel onboarding-progress-panel">
          <div className="onboarding-progress-top">
            <p className="eyebrow">Onboarding</p>
            <p className="tiny muted">{currentQ + 1} / {questions.length}</p>
          </div>
          <div className="onboarding-progress-track" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={currentQ + 1}>
            <span className="onboarding-progress-fill" style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }} />
          </div>
        </section>

        <div className="onboarding-stack-wrap" key={q.id}>
          <div className="onboarding-stack-layer layer-one" aria-hidden="true" />
          <div className="onboarding-stack-layer layer-two" aria-hidden="true" />
          <section className="panel onboarding-card">
            <DimensionPill label={q.dimension} color={q.dimensionColor} />
            <p className="onboarding-prompt">{q.prompt}</p>
            {q.isBonus ? <p className="onboarding-bonus">Bonus question</p> : null}
            <h2>{q.question}</h2>

            <div className="onboarding-body">
              {q.type === "cards" ? (
                <div className="stack">
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
                      handleAnswer(current.filter((entry) => entry !== value));
                      return;
                    }
                    if (current.length < (q.maxSelect ?? 2)) {
                      handleAnswer([...current, value]);
                    }
                  }}
                />
              ) : null}

              <p className="onboarding-insight">{q.insight}</p>
              {currentQ >= 3 ? <p className="onboarding-preview">{getLivePreviewText(answers)} Let&apos;s keep going.</p> : null}
              {error ? <p className="onboarding-error">{error}</p> : null}
            </div>

            <footer className="onboarding-footer">
              <button type="button" className="ghost" onClick={() => void goBack()} disabled={currentQ === 0 || saving}>
                Back
              </button>
              <button type="button" onClick={() => void goNext()} disabled={!readyForNext || saving}>
                {saving ? "Saving..." : currentQ === questions.length - 1 ? "See my matches" : "Continue"}
              </button>
            </footer>
          </section>
        </div>
      </section>
    </main>
  );
}
