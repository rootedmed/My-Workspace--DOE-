"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MatchResult, OnboardingProfile, UserPhoto } from "@/lib/domain/types";
import { withCsrfHeaders } from "@/components/auth/csrf";

type WizardMode = "deep";
type AppTab = "home" | "results" | "discover" | "matches" | "me";

type WizardValues = {
  emotionalPacing: "" | "slow" | "steady" | "fast";
  conflictApproach: "" | "soft_repair" | "direct_repair" | "cooldown_repair";
  reassuranceNeeds: "" | "1" | "2" | "3" | "4" | "5";
  attachmentLeaning: "" | "secure" | "anxious" | "avoidant";
  socialEnergy: "" | "1" | "2" | "3" | "4" | "5";
  lifestyleRhythms: "" | "structured" | "balanced" | "spontaneous";
  pastPatternReflection: "" | "1" | "2" | "3" | "4" | "5";
};

type OnboardingResponse = {
  profile: OnboardingProfile;
  tendenciesSummary: string[];
};

type MatchResponse = {
  userId: string;
  matches: MatchResult[];
  emptyReason?: string | null;
};

type PhotosResponse = {
  photos: UserPhoto[];
};

type DiscoverCandidate = {
  id: string;
  firstName: string;
  ageRange: string;
  locationPreference: string;
};

type DiscoverResponse = {
  candidates: DiscoverCandidate[];
  emptyReason?: string | null;
};

type ProgressResponse = {
  progress: {
    current_step: number;
    completed: boolean;
    total_steps: number;
    mode: "fast" | "deep";
  };
  draft: Record<string, string | number>;
};

type ChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  type: "message" | "suggested_topic" | "decision_prompt" | "decision_complete" | "system";
  created_at: string;
};

type ThreadResponse = {
  conversation: { id: string };
  messages: ChatMessage[];
  decisionTrack: {
    day_number: number;
    status: "pending" | "in_progress" | "completed";
    prompt_id: string;
  };
  suggestedTopics: string[];
};

type QuestionOption = {
  label: string;
  value: string;
};

type QuestionDef = {
  id: string;
  category: string;
  title: string;
  description: string;
  kind: "select";
  field: string;
  options?: QuestionOption[];
};

const initialValues: WizardValues = {
  emotionalPacing: "",
  conflictApproach: "",
  reassuranceNeeds: "",
  attachmentLeaning: "",
  socialEnergy: "",
  lifestyleRhythms: "",
  pastPatternReflection: ""
};

const scaleOptions: QuestionOption[] = [
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4", value: "4" },
  { label: "5", value: "5" }
];

const questions: QuestionDef[] = [
  {
    id: "emotional_pacing",
    category: "Emotional pacing",
    title: "How quickly do you like a relationship to build momentum?",
    description: "Choose the pace that feels natural.",
    kind: "select",
    field: "emotionalPacing",
    options: [
      { label: "Slow burn", value: "slow" },
      { label: "Balanced", value: "steady" },
      { label: "Fast momentum", value: "fast" }
    ]
  },
  {
    id: "conflict_approach",
    category: "Conflict approach",
    title: "When tension comes up, what feels most like you?",
    description: "Pick your default style.",
    kind: "select",
    field: "conflictApproach",
    options: [
      { label: "Gentle repair", value: "soft_repair" },
      { label: "Direct then repair", value: "direct_repair" },
      { label: "Need cooldown first", value: "cooldown_repair" }
    ]
  },
  {
    id: "reassurance_needs",
    category: "Reassurance needs",
    title: "How much reassurance do you want during uncertainty?",
    description: "1 = low, 5 = high.",
    kind: "select",
    field: "reassuranceNeeds",
    options: scaleOptions
  },
  {
    id: "attachment_leaning",
    category: "Attachment leaning",
    title: "Which attachment style feels closest to your default?",
    description: "Choose one best fit.",
    kind: "select",
    field: "attachmentLeaning",
    options: [
      { label: "Secure", value: "secure" },
      { label: "Anxious", value: "anxious" },
      { label: "Avoidant", value: "avoidant" }
    ]
  },
  {
    id: "social_energy",
    category: "Social energy",
    title: "How social do you feel most weeks?",
    description: "1 = quiet, 5 = highly social.",
    kind: "select",
    field: "socialEnergy",
    options: scaleOptions
  },
  {
    id: "lifestyle_rhythms",
    category: "Lifestyle rhythms",
    title: "What rhythm best matches your lifestyle?",
    description: "Pick the closest option.",
    kind: "select",
    field: "lifestyleRhythms",
    options: [
      { label: "Structured", value: "structured" },
      { label: "Balanced", value: "balanced" },
      { label: "Spontaneous", value: "spontaneous" }
    ]
  },
  {
    id: "past_pattern_reflection",
    category: "Past pattern reflection",
    title: "How often do you reflect and adjust your relationship patterns?",
    description: "1 = rarely, 5 = consistently.",
    kind: "select",
    field: "pastPatternReflection",
    options: scaleOptions
  }
];

type OnboardingFlowProps = {
  userId: string;
  firstName?: string | null;
};

function setFieldValue(values: WizardValues, field: string, nextValue: string): WizardValues {
  return { ...values, [field]: nextValue } as WizardValues;
}

function getFieldValue(values: WizardValues, field: string): string {
  return (values[field as keyof WizardValues] as string | undefined) ?? "";
}

function toLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function likertFromScore(score: number): string {
  const mapped = Math.round(score / 20);
  return String(Math.min(5, Math.max(1, mapped || 3)));
}

function clampLikert(value: number): number {
  return Math.min(5, Math.max(1, Math.round(value)));
}

function valuesFromProfile(profile: OnboardingProfile): WizardValues {
  const emotionalPacing: WizardValues["emotionalPacing"] =
    profile.intent.timelineMonths >= 20 ? "slow" : profile.intent.timelineMonths >= 12 ? "steady" : "fast";
  const attachmentLeaning: WizardValues["attachmentLeaning"] =
    profile.tendencies.attachmentAnxiety <= 45 && profile.tendencies.attachmentAvoidance <= 45
      ? "secure"
      : profile.tendencies.attachmentAnxiety >= profile.tendencies.attachmentAvoidance
        ? "anxious"
        : "avoidant";
  const lifestyleRhythms: WizardValues["lifestyleRhythms"] =
    profile.tendencies.noveltyPreference >= 65 ? "spontaneous" : profile.tendencies.noveltyPreference <= 35 ? "structured" : "balanced";
  const conflictApproach: WizardValues["conflictApproach"] =
    profile.tendencies.conflictRepair >= 70 ? "soft_repair" : profile.tendencies.conflictRepair >= 45 ? "direct_repair" : "cooldown_repair";
  return {
    emotionalPacing,
    conflictApproach,
    reassuranceNeeds: likertFromScore(profile.tendencies.attachmentAnxiety) as WizardValues["reassuranceNeeds"],
    attachmentLeaning,
    socialEnergy: likertFromScore(profile.personality.extraversion) as WizardValues["socialEnergy"],
    lifestyleRhythms,
    pastPatternReflection: likertFromScore(profile.tendencies.emotionalRegulation) as WizardValues["pastPatternReflection"]
  };
}

export function OnboardingFlow({ userId, firstName }: OnboardingFlowProps) {
  const [tab, setTab] = useState<AppTab>("home");
  const [mode] = useState<WizardMode>("deep");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [values, setValues] = useState<WizardValues>(initialValues);
  const [loading, setLoading] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const submitLockRef = useRef(false);
  const [isEditingOnboarding, setIsEditingOnboarding] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [saved, setSaved] = useState<OnboardingResponse | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matchesError, setMatchesError] = useState<string | null>(null);
  const [matchesEmptyReason, setMatchesEmptyReason] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [discoverCandidates, setDiscoverCandidates] = useState<DiscoverCandidate[]>([]);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [discoverEmptyReason, setDiscoverEmptyReason] = useState<string | null>(null);
  const [threadParticipantId, setThreadParticipantId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState("");

  const totalSteps = questions.length;
  const currentQuestion = questions[Math.min(questionIndex, totalSteps - 1)] ?? questions[0]!;
  const currentValue = getFieldValue(values, currentQuestion.field);

  const onboardingCompleted = Boolean(saved);

  const canContinue = useMemo(() => currentValue.trim().length > 0, [currentValue]);

  const progress = ((questionIndex + 1) / totalSteps) * 100;

  const hydrate = useCallback(async () => {
    setLoadingProgress(true);
    setOnboardingError(null);
    setDiscoverError(null);

    try {
      const [progressRes, profileRes, photosRes, discoverRes] = await Promise.all([
        fetch("/api/onboarding/progress", { cache: "no-store" }),
        fetch("/api/onboarding/profile", { cache: "no-store" }),
        fetch("/api/photos", { cache: "no-store" }),
        fetch("/api/discover", { cache: "no-store" })
      ]);

      if (progressRes.ok) {
        const progressPayload = (await progressRes.json()) as ProgressResponse;
        setQuestionIndex(Math.max(0, Math.min(progressPayload.progress.current_step - 1, progressPayload.progress.total_steps - 1)));

        const nextValues = { ...initialValues };
        for (const question of questions) {
          const raw = progressPayload.draft[question.id];
          if (typeof raw === "string" || typeof raw === "number") {
            Object.assign(nextValues, setFieldValue(nextValues, question.field, String(raw)));
          }
        }
        setValues((prev) => ({ ...prev, ...nextValues }));
      }

      if (profileRes.ok) {
        const profilePayload = (await profileRes.json()) as { profile: OnboardingProfile | null; tendenciesSummary: string[] };
        if (profilePayload.profile) {
          setSaved({ profile: profilePayload.profile, tendenciesSummary: profilePayload.tendenciesSummary ?? [] });
          setValues(valuesFromProfile(profilePayload.profile));
          setQuestionIndex(totalSteps - 1);
          setIsEditingOnboarding(false);
        }
      }

      if (photosRes.ok) {
        const photosPayload = (await photosRes.json()) as PhotosResponse;
        setPhotos(photosPayload.photos ?? []);
      }

      if (discoverRes.ok) {
        const discoverPayload = (await discoverRes.json()) as DiscoverResponse;
        setDiscoverCandidates(discoverPayload.candidates ?? []);
        setDiscoverEmptyReason(discoverPayload.emptyReason ?? null);
      }
    } catch (cause) {
      console.error("onboarding_hydrate_failed", cause);
      setOnboardingError("Could not load profile state.");
    } finally {
      setLoadingProgress(false);
    }
  }, [totalSteps]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const persistCurrentAnswer = useCallback(async (nextStep: number) => {
    const payload = {
      questionId: currentQuestion.id,
      value: currentValue,
      currentStep: questionIndex + 1,
      nextStep,
      totalSteps,
      mode
    };

    const response = await fetch("/api/onboarding/answer", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as
        | { error?: string; details?: { message?: string }; expectedStep?: number }
        | null;
      throw new Error(
        `${data?.error ?? "Could not persist answer."} ${data?.details?.message ?? ""}`.trim() ||
          (typeof data?.expectedStep === "number"
            ? `Resume from step ${data.expectedStep}.`
            : "Could not persist answer.")
      );
    }
  }, [currentQuestion.id, currentValue, questionIndex, totalSteps, mode]);

  const persistStepPosition = useCallback(async (step: number) => {
    const response = await fetch("/api/onboarding/progress", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ currentStep: step, totalSteps, mode, completed: false })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not persist progress.");
    }
  }, [totalSteps, mode]);

  const handleAdvance = useCallback(async () => {
    if (!canContinue || isSubmittingAnswer || submitLockRef.current) return;

    submitLockRef.current = true;
    setIsSubmittingAnswer(true);
    setOnboardingError(null);
    try {
      const nextStep = questionIndex + 2;
      await persistCurrentAnswer(nextStep);
      setQuestionIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    } catch (cause) {
      console.error("onboarding_advance_failed", cause);
      const message = cause instanceof Error ? cause.message : "Could not advance onboarding.";
      setOnboardingError(message);
    } finally {
      setIsSubmittingAnswer(false);
      submitLockRef.current = false;
    }
  }, [canContinue, isSubmittingAnswer, questionIndex, totalSteps, persistCurrentAnswer]);

  const handleSubmitOnboarding = useCallback(async () => {
    if (!canContinue || loading || isSubmittingAnswer || submitLockRef.current) return;

    submitLockRef.current = true;
    setLoading(true);
    setOnboardingError(null);

    try {
      await persistCurrentAnswer(totalSteps);

      const reassurance = clampLikert(Number(values.reassuranceNeeds));
      const reflection = clampLikert(Number(values.pastPatternReflection));
      const socialEnergy = clampLikert(Number(values.socialEnergy));

      const attachmentBase =
        values.attachmentLeaning === "anxious"
          ? { anxiety: 4, avoidance: 2 }
          : values.attachmentLeaning === "avoidant"
            ? { anxiety: 2, avoidance: 4 }
            : { anxiety: 2, avoidance: 2 };
      const attachmentAnxiety = clampLikert((attachmentBase.anxiety + reassurance) / 2);
      const attachmentAvoidance = clampLikert(attachmentBase.avoidance);

      const conflictScores =
        values.conflictApproach === "soft_repair"
          ? { startupSoftness: 5, repairAfterConflict: 5, agreeableness: 5 }
          : values.conflictApproach === "direct_repair"
            ? { startupSoftness: 3, repairAfterConflict: 4, agreeableness: 3 }
            : { startupSoftness: 2, repairAfterConflict: 2, agreeableness: 2 };

      const pacingMap =
        values.emotionalPacing === "slow"
          ? { timelineMonths: 24, readiness: 3 }
          : values.emotionalPacing === "fast"
            ? { timelineMonths: 8, readiness: 5 }
            : { timelineMonths: 14, readiness: 4 };

      const lifestyleMap =
        values.lifestyleRhythms === "structured"
          ? { weeklyCapacity: 2, noveltyPreference: 2, conscientiousness: 5 }
          : values.lifestyleRhythms === "spontaneous"
            ? { weeklyCapacity: 4, noveltyPreference: 5, conscientiousness: 2 }
            : { weeklyCapacity: 3, noveltyPreference: 3, conscientiousness: 4 };

      const payload = {
        firstName: firstName?.trim() || "You",
        ageRange: "31_37",
        locationPreference: "same_city",
        lookingFor: "serious_relationship",
        timelineMonths: pacingMap.timelineMonths,
        readiness: pacingMap.readiness,
        weeklyCapacity: lifestyleMap.weeklyCapacity,
        attachment: {
          anxiety: [attachmentAnxiety, attachmentAnxiety, attachmentAnxiety],
          avoidance: [attachmentAvoidance, attachmentAvoidance, attachmentAvoidance]
        },
        conflict: {
          startupSoftness: conflictScores.startupSoftness,
          repairAfterConflict: conflictScores.repairAfterConflict
        },
        regulation: {
          calmUnderStress: reflection,
          pauseBeforeReacting: reflection
        },
        personality: {
          openness: lifestyleMap.noveltyPreference,
          conscientiousness: lifestyleMap.conscientiousness,
          extraversion: socialEnergy,
          agreeableness: conflictScores.agreeableness,
          emotionalStability: reflection
        },
        noveltyPreference: lifestyleMap.noveltyPreference
      };

      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const res = (await response.json().catch(() => null)) as { error?: string; details?: { message?: string } } | null;
        setOnboardingError(`${res?.error ?? "Could not save onboarding."} ${res?.details?.message ?? ""}`.trim());
        return;
      }

      const data = (await response.json()) as OnboardingResponse;
      setSaved(data);
      setSavedBanner("Analysis saved.");

      const finalizeProgressRes = await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ currentStep: totalSteps, totalSteps, mode, completed: true })
      });
      if (!finalizeProgressRes.ok) {
        throw new Error("Could not finalize onboarding progress.");
      }

      setIsEditingOnboarding(false);
      setTab("results");
    } catch (cause) {
      console.error("onboarding_submit_failed", cause);
      const message = cause instanceof Error ? cause.message : "Could not save onboarding.";
      setOnboardingError(message);
    } finally {
      setLoading(false);
      submitLockRef.current = false;
    }
  }, [canContinue, loading, isSubmittingAnswer, values, totalSteps, persistCurrentAnswer, firstName, mode]);

  async function loadMatches() {
    setMatchesError(null);
    const response = await fetch("/api/matches/preview", { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setMatchesError(payload?.error ?? "Could not load match results.");
      return;
    }
    const data = (await response.json()) as MatchResponse;
    setMatches(data.matches ?? []);
    setMatchesEmptyReason(data.emptyReason ?? null);
  }

  async function loadDiscover() {
    setDiscoverError(null);
    const response = await fetch("/api/discover", { cache: "no-store" });
    if (!response.ok) {
      setDiscoverCandidates([]);
      setDiscoverError("Could not load Discover.");
      setDiscoverEmptyReason("Could not load Discover.");
      return;
    }
    const payload = (await response.json()) as DiscoverResponse;
    setDiscoverCandidates(payload.candidates ?? []);
    setDiscoverEmptyReason(payload.emptyReason ?? null);
  }

  async function openThread(participantId: string) {
    setThreadParticipantId(participantId);
    setChatError(null);
    const response = await fetch(`/api/chat/thread?participantId=${participantId}`, { cache: "no-store" });
    if (!response.ok) {
      setChatError("Could not load guided chat.");
      return;
    }
    const payload = (await response.json()) as ThreadResponse;
    setThread(payload);
  }

  async function postThread(action: "send_message" | "send_topic" | "start_day" | "complete_day", body?: string) {
    if (!threadParticipantId) return;

    const response = await fetch("/api/chat/thread", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ participantId: threadParticipantId, action, body })
    });
    if (!response.ok) {
      setChatError("Could not update chat.");
      return;
    }

    await openThread(threadParticipantId);
  }

  async function uploadPhoto(slot: number, file: File) {
    setPhotoError(null);
    setUploadingSlot(slot);

    const formData = new FormData();
    formData.append("slot", String(slot));
    formData.append("file", file);

    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: await withCsrfHeaders(),
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; details?: { message?: string | null; code?: string | null } }
          | null;
        const detail = payload?.details?.message ?? payload?.details?.code ?? "";
        setPhotoError(`${payload?.error ?? "Could not upload photo."}${detail ? ` ${detail}` : ""}`);
        return;
      }

      const payload = (await response.json()) as { photo: UserPhoto };
      setPhotos((prev) => {
        const without = prev.filter((photo) => photo.slot !== payload.photo.slot);
        return [...without, payload.photo].sort((a, b) => a.slot - b.slot);
      });
    } finally {
      setUploadingSlot(null);
    }
  }

  async function resetOnboarding() {
    const response = await fetch("/api/onboarding/reset?dev=1", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ reset: true })
    });
    if (!response.ok) {
      setOnboardingError("Could not reset onboarding.");
      return;
    }

    setValues(initialValues);
    setQuestionIndex(0);
    setSaved(null);
    setIsEditingOnboarding(false);
    setSavedBanner("Onboarding reset.");
    setTab("home");
    await hydrate();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: await withCsrfHeaders() });
    window.location.href = "/login";
  }

  const profile = saved?.profile;
  const displayName = profile?.firstName ?? firstName ?? "You";
  const showReset = typeof window !== "undefined" && (window.location.search.includes("dev=1") || process.env.NODE_ENV !== "production");
  const reviewRows = questions.map((question) => ({
    category: question.category,
    value: question.options?.find((option) => option.value === getFieldValue(values, question.field))?.label ?? "Not answered"
  }));

  return (
    <section className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Today</p>
        <h1>Hey, {displayName}</h1>
        {!onboardingCompleted ? (
          <div className="trust-chip">Complete your style analysis to unlock the app.</div>
        ) : (
          <div className="trust-chip">Analysis complete. Results are ready.</div>
        )}
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          className="app-screen"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {loadingProgress ? <section className="panel"><p className="muted">Loading profile...</p></section> : null}

          {tab === "home" ? (
            <div className="stack">
              <section className="panel panel-tight onboarding-top">
                <h2>Dating Style Analysis</h2>
                <p className="muted">
                  {!onboardingCompleted || isEditingOnboarding
                    ? `Question ${questionIndex + 1} of ${totalSteps}`
                    : "View your results or edit answers from Me."}
                </p>
                <div className="actions">
                  {!onboardingCompleted || isEditingOnboarding ? (
                    <button type="button" onClick={() => setTab("home")}>Continue</button>
                  ) : (
                    <>
                      <button type="button" onClick={() => setTab("results")}>Open results</button>
                      <button type="button" className="ghost" onClick={() => setIsEditingOnboarding(true)}>Edit answers</button>
                    </>
                  )}
                </div>
              </section>

              {!onboardingCompleted || isEditingOnboarding ? (
                <section className="panel onboarding-card elevated">
                  <div className="progress-wrap" aria-hidden="true">
                    <span className="progress-text">Step {questionIndex + 1} of {totalSteps}</span>
                    <div className="progress-track">
                      <motion.span className="progress-fill" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.2, ease: "easeOut" }} />
                    </div>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={currentQuestion.id} className="question-card stage-card" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                      <p className="eyebrow">{currentQuestion.category}</p>
                      <p className="question-label">{currentQuestion.title}</p>
                      <p className="muted">{currentQuestion.description}</p>
                      <div className="option-grid" role="group" aria-label={currentQuestion.title}>
                        {currentQuestion.options?.map((option) => (
                          <button key={option.value} id={currentQuestion.id} type="button" className={currentValue === option.value ? "answer-chip active" : "answer-chip"} onClick={() => setValues((prev) => setFieldValue(prev, currentQuestion.field, option.value))} aria-pressed={currentValue === option.value}>{option.label}</button>
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  <div className="actions">
                    <button
                      type="button"
                      disabled={questionIndex === 0 || isSubmittingAnswer || loading}
                      className="ghost"
                      onClick={async () => {
                        const nextIndex = Math.max(0, questionIndex - 1);
                        setQuestionIndex(nextIndex);
                        try {
                          await persistStepPosition(nextIndex + 1);
                        } catch (cause) {
                          console.error("persist_previous_step_failed", cause);
                          setOnboardingError("Could not persist progress.");
                        }
                      }}
                    >
                      Previous
                    </button>
                    {questionIndex < totalSteps - 1 ? (
                      <button type="button" disabled={!canContinue || isSubmittingAnswer || loading} onClick={handleAdvance}>{isSubmittingAnswer ? "Saving..." : "Next"}</button>
                    ) : (
                      <button type="button" disabled={!canContinue || loading || isSubmittingAnswer} onClick={handleSubmitOnboarding}>{loading ? "Saving..." : (isEditingOnboarding ? "Update results" : "See results")}</button>
                    )}
                  </div>
                </section>
              ) : null}

              {onboardingError ? (
                <section className="panel panel-tight">
                  <p role="alert" className="inline-error">{onboardingError}</p>
                </section>
              ) : null}

              {savedBanner ? <p className="inline-ok">{savedBanner}</p> : null}
              {showReset ? (
                <section className="panel panel-tight">
                  <h3>Dev panel</h3>
                  <p className="muted tiny">user_id: {userId} | step: {questionIndex + 1}/{totalSteps} | candidates: {discoverCandidates.length} | matches: {matches.length}</p>
                  <div className="actions">
                    <button type="button" className="ghost" onClick={resetOnboarding}>Reset onboarding</button>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "results" ? (
            <div className="stack">
              <section className="panel elevated">
                <p className="eyebrow">Results</p>
                <h2>Your Dating Style Snapshot</h2>
                <p className="muted">These insights are generated from your onboarding answers.</p>
                {saved?.tendenciesSummary?.length ? (
                  <ul className="list">
                    {saved.tendenciesSummary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Your analysis has been saved.</p>
                )}
                <div className="actions">
                  <button type="button" onClick={() => setTab("discover")}>Go to Discover</button>
                  <button type="button" className="ghost" onClick={() => setTab("me")}>Review answers in Me</button>
                </div>
              </section>
            </div>
          ) : null}

          {tab === "discover" ? (
            <div className="stack">
              {!onboardingCompleted ? <section className="panel panel-tight"><p className="muted">Finish setup first to get accurate discovery.</p><div className="actions"><button type="button" onClick={() => setTab("home")}>Finish setup</button></div></section> : null}

              <section className="panel">
                <h3>Discover pool</h3>
                <p className="muted">Every completed profile appears here in V1.</p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={loadDiscover}>Refresh Discover</button>
                </div>
                {discoverError ? <p role="alert" className="inline-error">{discoverError}</p> : null}
                {discoverCandidates.length === 0 ? <p className="muted">{discoverEmptyReason ?? "No candidates yet."}</p> : null}
                <div className="stack">
                  {discoverCandidates.map((candidate) => (
                    <article key={candidate.id} className="prompt-card">
                      <strong>{candidate.firstName}</strong>
                      <p className="muted">{toLabel(candidate.ageRange)} · {toLabel(candidate.locationPreference)}</p>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          ) : null}

          {tab === "matches" ? (
            <div className="stack">
              <section className="panel">
                <h2>Matches</h2>
                <p className="muted">See compatible matches and move into guided chat.</p>
                <div className="actions">
                  <button type="button" onClick={loadMatches} disabled={!onboardingCompleted}>Load match results</button>
                </div>
                {matchesError ? <p role="alert" className="inline-error">{matchesError}</p> : null}
                {!onboardingCompleted ? <p className="muted">Finish onboarding to generate matches.</p> : null}
                {matches.length === 0 && onboardingCompleted ? <p className="muted">{matchesEmptyReason ?? "No matches yet."}</p> : null}
              </section>

              {matches.map((match) => (
                <section key={match.candidateId} className="panel">
                  <p className="eyebrow">{match.totalScore}/100 compatibility</p>
                  <h3>{match.candidateFirstName}</h3>
                  <ul className="list">
                    {match.topFitReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                  <div className="actions">
                    <button type="button" onClick={() => openThread(match.candidateId)}>Open guided chat</button>
                  </div>
                </section>
              ))}

              {thread && threadParticipantId ? (
                <section className="panel">
                  <h3>Guided chat</h3>
                  {chatError ? <p role="alert" className="inline-error">{chatError}</p> : null}
                  <p className="muted">Day {thread.decisionTrack.day_number} of 14 · {thread.decisionTrack.status}</p>
                  <div className="actions">
                    <button type="button" className="ghost" onClick={() => postThread("start_day")}>Start today&apos;s prompt</button>
                    <button type="button" className="ghost" onClick={() => postThread("complete_day")}>Complete today</button>
                  </div>

                  <p className="muted">Suggested topics</p>
                  <div className="actions">
                    {thread.suggestedTopics.slice(0, 3).map((topic) => (
                      <button key={topic} type="button" className="ghost" onClick={() => postThread("send_topic", topic)}>{topic}</button>
                    ))}
                  </div>

                  <div className="stack">
                    {thread.messages.map((message) => (
                      <article key={message.id} className="prompt-card">
                        <p className="tiny muted">{message.type}</p>
                        <p>{message.body}</p>
                      </article>
                    ))}
                  </div>

                  <label>
                    Message
                    <input value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} placeholder="Type a message" />
                  </label>
                  <div className="actions">
                    <button type="button" onClick={() => { void postThread("send_message", chatDraft); setChatDraft(""); }} disabled={chatDraft.trim().length < 1}>Send</button>
                    <button type="button" className="ghost" onClick={() => openThread(threadParticipantId)}>Refresh chat</button>
                  </div>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "me" ? (
            <div className="stack">
              <section className="panel profile-hero elevated">
                <p className="eyebrow">Me</p>
                <h2>{displayName}</h2>
                <p className="muted">Review and edit your onboarding answers anytime.</p>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      setIsEditingOnboarding(true);
                      setTab("home");
                    }}
                  >
                    Edit Dating Style Analysis
                  </button>
                  {saved ? <button type="button" onClick={() => setTab("results")}>Open Results</button> : null}
                </div>
              </section>

              <section className="panel">
                <h3>Analysis answers</h3>
                <div className="stack">
                  {reviewRows.map((row) => (
                    <article key={row.category} className="prompt-card">
                      <p className="eyebrow">{row.category}</p>
                      <p>{row.value}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel">
                <h3>Photos</h3>
                <p className="muted">Upload, replace, and manage up to 6 photos.</p>
                <div className="photo-grid" aria-label="Profile photo placeholders">
                  {Array.from({ length: 6 }).map((_, index) => {
                    const slot = index + 1;
                    const slotPhoto = photos.find((photo) => photo.slot === slot);
                    return (
                      <article key={`photo-${index}`} className="photo-slot">
                        {slotPhoto ? (
                          <Image src={slotPhoto.url} alt={`Profile photo slot ${slot}`} className="photo-preview" width={400} height={520} unoptimized />
                        ) : (
                          <span>Photo {slot}</span>
                        )}
                        <label className="upload-button">
                          {uploadingSlot === slot ? "Uploading..." : slotPhoto ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingSlot === slot}
                            onChange={(event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              void uploadPhoto(slot, file);
                              event.currentTarget.value = "";
                            }}
                          />
                        </label>
                      </article>
                    );
                  })}
                </div>
                {photoError ? <p className="inline-error">{photoError}</p> : null}
              </section>

              <section className="panel panel-tight">
                <div className="actions">
                  {showReset ? <button type="button" className="ghost" onClick={resetOnboarding}>Reset onboarding (dev)</button> : null}
                  <button type="button" className="ghost" onClick={signOut}>Sign out</button>
                </div>
                <p className="muted tiny">User ID: {userId}</p>
              </section>
            </div>
          ) : null}

        </motion.div>
      </AnimatePresence>

      <nav className="bottom-nav" aria-label="Main">
        <button type="button" className={tab === "home" ? "nav-item active" : "nav-item"} onClick={() => setTab("home")}><span className="nav-dot" aria-hidden="true" /><span>Home</span></button>
        <button type="button" className={tab === "discover" ? "nav-item active" : "nav-item"} onClick={() => setTab("discover")}><span className="nav-dot" aria-hidden="true" /><span>Discover</span></button>
        <button type="button" className={tab === "matches" ? "nav-item active" : "nav-item"} onClick={() => setTab("matches")}><span className="nav-dot" aria-hidden="true" /><span>Matches</span></button>
        <button type="button" className={tab === "me" ? "nav-item active" : "nav-item"} onClick={() => setTab("me")}><span className="nav-dot" aria-hidden="true" /><span>Me</span></button>
      </nav>
    </section>
  );
}
