"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { withCsrfHeaders } from "@/components/auth/csrf";
import {
  onboardingQuestions,
  type OnboardingQuestionDef,
  type OnboardingQuestionId
} from "@/constants/onboardingQuestions";
import {
  deriveAttachmentAxis,
  deriveReadinessScore,
  type ConflictSpeed,
  type EmotionalOpenness,
  type GrowthIntention,
  type LoveExpression,
  type PastAttribution,
  type RelationshipVision,
  type RelationalStrength,
  type SupportNeed,
  type UserCompatibilityProfile
} from "@/lib/compatibility";
import { CompletionScreen } from "./CompletionScreen";
import styles from "./OnboardingFlow.module.css";
import { CardOptions } from "./inputs/CardOptions";
import { RankSelector } from "./inputs/RankSelector";
import { SpectrumSelector } from "./inputs/SpectrumSelector";

type ProfileQuestionId = Exclude<OnboardingQuestionId, "lifestyle_energy">;

type OnboardingAnswers = {
  past_attribution?: PastAttribution;
  conflict_speed?: ConflictSpeed;
  love_expression?: LoveExpression[];
  support_need?: SupportNeed;
  emotional_openness?: EmotionalOpenness;
  relationship_vision?: RelationshipVision;
  relational_strengths?: RelationalStrength[];
  growth_intention?: GrowthIntention;
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

const profileQuestions = onboardingQuestions.filter(
  (question) => question.id !== "lifestyle_energy"
) as Array<OnboardingQuestionDef<ProfileQuestionId>>;

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
  const [screenVisible, setScreenVisible] = useState(false);

  const question = profileQuestions[currentQ]!;
  const readyForNext = hasAnswer(answers[question.id]);

  const completedProfile = useMemo<UserCompatibilityProfile | null>(() => {
    if (
      !answers.past_attribution ||
      !answers.conflict_speed ||
      !answers.love_expression ||
      !answers.support_need ||
      !answers.emotional_openness ||
      !answers.relationship_vision ||
      !answers.relational_strengths ||
      !answers.growth_intention
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
        growth_intention: draft.growth_intention as GrowthIntention | undefined
      });
      setCurrentQ(Math.max(0, Math.min((payload.progress.current_step ?? 1) - 1, profileQuestions.length - 1)));
      setDone(Boolean(payload.progress.completed));
      setLoading(false);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setScreenVisible(false);
    const timer = window.setTimeout(() => setScreenVisible(true), 40);
    return () => window.clearTimeout(timer);
  }, [question.id]);

  function handleAnswer(value: string | number | string[]) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
  }

  async function persistStep(nextStep: number, value: string | number | string[]) {
    const response = await fetch("/api/onboarding/answer", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        questionId: question.id,
        value,
        currentStep: currentQ + 1,
        nextStep,
        totalSteps: profileQuestions.length,
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
    const value = answers[question.id];
    if (value === undefined) return;

    setSaving(true);
    setError(null);

    try {
      const nextStep = Math.min(profileQuestions.length, currentQ + 2);
      await persistStep(nextStep, value as string | number | string[]);

      if (currentQ < profileQuestions.length - 1) {
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
          growth_intention: completedProfile.growth_intention
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
    if (currentQ <= 0 || saving) return;

    const previousStep = currentQ;
    setCurrentQ((prev) => prev - 1);

    await fetch("/api/onboarding/progress", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        currentStep: previousStep,
        totalSteps: profileQuestions.length,
        mode: "deep",
        completed: false
      })
    }).catch(() => undefined);
  }

  if (loading) {
    return <div className={styles.loading}>Loading onboarding...</div>;
  }

  if (done && completedProfile) {
    return (
      <CompletionScreen
        profile={completedProfile}
        onContinue={() => {
          void completeOnboarding();
        }}
      />
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.progressWrap}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressBar}
            style={{ width: `${((currentQ + 1) / profileQuestions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className={styles.counter}>
        {currentQ + 1} / {profileQuestions.length}
      </div>

      <div className={`${styles.screen} ${screenVisible ? styles.screenVisible : ""}`} key={question.id}>
        <div className={styles.screenInner}>
          <div
            className={styles.pill}
            style={{
              color: question.dimensionColor,
              background: `${question.dimensionColor}20`,
              border: `1px solid ${question.dimensionColor}50`
            }}
          >
            <span className={styles.pillDot} style={{ background: question.dimensionColor }} />
            {question.dimension}
          </div>

          <p className={styles.prompt}>{question.prompt}</p>
          <h2 className={styles.title}>{question.question}</h2>

          <div className={styles.content}>
            {question.type === "cards" ? (
              <CardOptions
                options={question.options as Array<{ label: string; desc: string; value: string }>}
                selectedValue={answers[question.id] as string | undefined}
                onSelect={(value) => handleAnswer(value)}
                disabled={saving}
              />
            ) : null}

            {question.type === "spectrum" ? (
              <SpectrumSelector
                options={question.options as Array<{ label: string; desc: string; value: number }>}
                leftLabel={question.leftLabel}
                rightLabel={question.rightLabel}
                value={answers[question.id] as number | undefined}
                onChange={(value) => handleAnswer(value)}
                activeColor={question.dimensionColor}
              />
            ) : null}

            {question.type === "rank" ? (
              <RankSelector
                options={question.options as Array<{ label: string; desc: string; value: string }>}
                selected={((answers[question.id] as string[] | undefined) ?? []) as string[]}
                maxSelect={question.maxSelect ?? 2}
                instruction={question.instruction}
                onChange={(next) => handleAnswer(next)}
              />
            ) : null}

            <div className={styles.insight}>{question.insight}</div>
            {error ? <p className={styles.error}>{error}</p> : null}
          </div>

          <div className={styles.footer}>
            <button type="button" onClick={() => void goBack()} disabled={currentQ === 0 || saving} className={styles.backButton}>
              Back
            </button>

            <button
              type="button"
              onClick={() => void goNext()}
              disabled={!readyForNext || saving}
              className={`${styles.continueButton} ${!readyForNext || saving ? styles.continueButtonDisabled : ""}`}
              style={
                readyForNext && !saving
                  ? {
                      background: `linear-gradient(135deg, ${question.dimensionColor}, ${question.dimensionColor}cc)`,
                      boxShadow: `0 4px 20px ${question.dimensionColor}40`
                    }
                  : undefined
              }
            >
              {saving ? "Saving..." : currentQ === profileQuestions.length - 1 ? "Review summary" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
