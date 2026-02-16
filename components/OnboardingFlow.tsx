"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { MatchResult, OnboardingProfile, UserPhoto } from "@/lib/domain/types";
import { withCsrfHeaders } from "@/components/auth/csrf";

type WizardMode = "fast" | "deep";
type AppTab = "home" | "discover" | "matches" | "me";

type WizardValues = {
  firstName: string;
  ageRange: "24_30" | "31_37" | "38_45" | "46_plus";
  locationPreference: "same_city" | "relocatable" | "remote_ok";
  lookingFor: "marriage_minded" | "serious_relationship" | "exploring";
  timelineMonths: string;
  readiness: string;
  weeklyCapacity: string;
  attachmentAnxiety: [string, string, string];
  attachmentAvoidance: [string, string, string];
  startupSoftness: string;
  repairAfterConflict: string;
  calmUnderStress: string;
  pauseBeforeReacting: string;
  openness: string;
  conscientiousness: string;
  extraversion: string;
  agreeableness: string;
  emotionalStability: string;
  noveltyPreference: string;
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
    mode: WizardMode;
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
  title: string;
  description: string;
  kind: "text" | "select" | "number";
  field: string;
  min?: number;
  max?: number;
  options?: QuestionOption[];
};

const initialValues: WizardValues = {
  firstName: "",
  ageRange: "31_37",
  locationPreference: "same_city",
  lookingFor: "marriage_minded",
  timelineMonths: "18",
  readiness: "4",
  weeklyCapacity: "2",
  attachmentAnxiety: ["3", "3", "3"],
  attachmentAvoidance: ["3", "3", "3"],
  startupSoftness: "3",
  repairAfterConflict: "3",
  calmUnderStress: "3",
  pauseBeforeReacting: "3",
  openness: "3",
  conscientiousness: "3",
  extraversion: "3",
  agreeableness: "3",
  emotionalStability: "3",
  noveltyPreference: "3"
};

const likertOptions: QuestionOption[] = [
  { label: "1 - Rarely true", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "4", value: "4" },
  { label: "5 - Often true", value: "5" }
];

const fastQuestions: QuestionDef[] = [
  {
    id: "firstName",
    title: "First name",
    description: "How should your matches know you?",
    kind: "text",
    field: "firstName"
  },
  {
    id: "lookingFor",
    title: "What are you looking for?",
    description: "We use this to calibrate intent alignment.",
    kind: "select",
    field: "lookingFor",
    options: [
      { label: "Marriage-minded", value: "marriage_minded" },
      { label: "Serious relationship", value: "serious_relationship" },
      { label: "Exploring", value: "exploring" }
    ]
  },
  {
    id: "timelineMonths",
    title: "Preferred commitment timeline (months)",
    description: "A realistic horizon helps reduce mismatched pacing.",
    kind: "number",
    field: "timelineMonths",
    min: 3,
    max: 60
  }
];

const deepQuestions: QuestionDef[] = [
  {
    id: "ageRange",
    title: "Age range",
    description: "Choose your preferred match range.",
    kind: "select",
    field: "ageRange",
    options: [
      { label: "24-30", value: "24_30" },
      { label: "31-37", value: "31_37" },
      { label: "38-45", value: "38_45" },
      { label: "46+", value: "46_plus" }
    ]
  },
  {
    id: "locationPreference",
    title: "Location preference",
    description: "Distance flexibility impacts match depth.",
    kind: "select",
    field: "locationPreference",
    options: [
      { label: "Same city", value: "same_city" },
      { label: "Relocatable", value: "relocatable" },
      { label: "Remote okay", value: "remote_ok" }
    ]
  },
  {
    id: "readiness",
    title: "Commitment readiness (1-5)",
    description: "How ready are you for a long-term commitment now?",
    kind: "number",
    field: "readiness",
    min: 1,
    max: 5
  },
  {
    id: "weeklyCapacity",
    title: "Weekly dating capacity",
    description: "How many quality dates can you realistically sustain?",
    kind: "number",
    field: "weeklyCapacity",
    min: 1,
    max: 7
  },
  {
    id: "anxious-1",
    title: "I worry about losing connection.",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "attachmentAnxiety.0",
    options: likertOptions
  },
  {
    id: "anxious-2",
    title: "I need reassurance when plans feel uncertain.",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "attachmentAnxiety.1",
    options: likertOptions
  },
  {
    id: "avoidant-1",
    title: "I need space before discussing intense feelings.",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "attachmentAvoidance.1",
    options: likertOptions
  },
  {
    id: "repair",
    title: "I actively repair after conflict.",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "repairAfterConflict",
    options: likertOptions
  },
  {
    id: "pause",
    title: "I pause before reacting emotionally.",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "pauseBeforeReacting",
    options: likertOptions
  },
  {
    id: "startup",
    title: "I start difficult conversations gently.",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "startupSoftness",
    options: likertOptions
  },
  {
    id: "calm",
    title: "I stay calm under stress.",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "calmUnderStress",
    options: likertOptions
  },
  {
    id: "openness",
    title: "Openness to new ideas",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "openness",
    options: likertOptions
  },
  {
    id: "conscientiousness",
    title: "Conscientiousness",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "conscientiousness",
    options: likertOptions
  },
  {
    id: "extraversion",
    title: "Extraversion",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "extraversion",
    options: likertOptions
  },
  {
    id: "agreeableness",
    title: "Agreeableness",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "agreeableness",
    options: likertOptions
  },
  {
    id: "stability",
    title: "Emotional stability",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "emotionalStability",
    options: likertOptions
  },
  {
    id: "novelty",
    title: "Novelty preference",
    description: "Choose the option that best reflects your baseline.",
    kind: "select",
    field: "noveltyPreference",
    options: likertOptions
  }
];

type OnboardingFlowProps = {
  userId: string;
  firstName?: string | null;
};

function setFieldValue(values: WizardValues, field: string, nextValue: string): WizardValues {
  if (!field.includes(".")) {
    return { ...values, [field]: nextValue } as WizardValues;
  }

  const [root, indexToken] = field.split(".");
  const index = Number(indexToken);

  if (root === "attachmentAnxiety") {
    const next = [...values.attachmentAnxiety] as [string, string, string];
    next[index] = nextValue;
    return { ...values, attachmentAnxiety: next };
  }

  if (root === "attachmentAvoidance") {
    const next = [...values.attachmentAvoidance] as [string, string, string];
    next[index] = nextValue;
    return { ...values, attachmentAvoidance: next };
  }

  return values;
}

function getFieldValue(values: WizardValues, field: string): string {
  if (!field.includes(".")) {
    return (values[field as keyof WizardValues] as string | undefined) ?? "";
  }

  const [root, indexToken] = field.split(".");
  const index = Number(indexToken);

  if (root === "attachmentAnxiety") {
    return values.attachmentAnxiety[index] ?? "";
  }

  if (root === "attachmentAvoidance") {
    return values.attachmentAvoidance[index] ?? "";
  }

  return "";
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

function valuesFromProfile(profile: OnboardingProfile): WizardValues {
  const anxiety = likertFromScore(profile.tendencies.attachmentAnxiety);
  const avoidance = likertFromScore(profile.tendencies.attachmentAvoidance);
  const repair = likertFromScore(profile.tendencies.conflictRepair);
  const regulation = likertFromScore(profile.tendencies.emotionalRegulation);

  return {
    firstName: profile.firstName,
    ageRange: profile.ageRange,
    locationPreference: profile.locationPreference,
    lookingFor: profile.intent.lookingFor,
    timelineMonths: String(profile.intent.timelineMonths),
    readiness: String(profile.intent.readiness),
    weeklyCapacity: String(profile.intent.weeklyCapacity),
    attachmentAnxiety: [anxiety, anxiety, anxiety],
    attachmentAvoidance: [avoidance, avoidance, avoidance],
    startupSoftness: repair,
    repairAfterConflict: repair,
    calmUnderStress: regulation,
    pauseBeforeReacting: regulation,
    openness: likertFromScore(profile.personality.openness),
    conscientiousness: likertFromScore(profile.personality.conscientiousness),
    extraversion: likertFromScore(profile.personality.extraversion),
    agreeableness: likertFromScore(profile.personality.agreeableness),
    emotionalStability: likertFromScore(profile.personality.emotionalStability),
    noveltyPreference: likertFromScore(profile.tendencies.noveltyPreference)
  };
}

export function OnboardingFlow({ userId, firstName }: OnboardingFlowProps) {
  const [tab, setTab] = useState<AppTab>("home");
  const [mode, setMode] = useState<WizardMode>("fast");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [values, setValues] = useState<WizardValues>(initialValues);
  const [loading, setLoading] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<OnboardingResponse | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [matchesEmptyReason, setMatchesEmptyReason] = useState<string | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [discoverCandidates, setDiscoverCandidates] = useState<DiscoverCandidate[]>([]);
  const [discoverEmptyReason, setDiscoverEmptyReason] = useState<string | null>(null);
  const [pairCode, setPairCode] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [threadParticipantId, setThreadParticipantId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [chatDraft, setChatDraft] = useState("");

  const questions = useMemo(() => (mode === "fast" ? fastQuestions : [...fastQuestions, ...deepQuestions]), [mode]);
  const totalSteps = questions.length;
  const currentQuestion = questions[Math.min(questionIndex, totalSteps - 1)] ?? questions[0]!;
  const currentValue = getFieldValue(values, currentQuestion.field);

  const onboardingCompleted = Boolean(saved);

  const canContinue = useMemo(() => {
    const value = currentValue.trim();
    if (currentQuestion.field === "firstName") {
      return value.length >= 2;
    }

    if (currentQuestion.kind === "number") {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) return false;
      if (typeof currentQuestion.min === "number" && parsed < currentQuestion.min) return false;
      if (typeof currentQuestion.max === "number" && parsed > currentQuestion.max) return false;
    }

    return value.length > 0;
  }, [currentQuestion, currentValue]);

  const progress = ((questionIndex + 1) / totalSteps) * 100;

  const hydrate = useCallback(async () => {
    setLoadingProgress(true);
    setError(null);

    try {
      const [progressRes, profileRes, photosRes, discoverRes] = await Promise.all([
        fetch("/api/onboarding/progress", { cache: "no-store" }),
        fetch("/api/onboarding/profile", { cache: "no-store" }),
        fetch("/api/photos", { cache: "no-store" }),
        fetch("/api/discover", { cache: "no-store" })
      ]);

      if (progressRes.ok) {
        const progressPayload = (await progressRes.json()) as ProgressResponse;
        setMode(progressPayload.progress.mode);
        setQuestionIndex(Math.max(0, Math.min(progressPayload.progress.current_step - 1, progressPayload.progress.total_steps - 1)));

        const nextValues = { ...initialValues };
        const questionMap = [...fastQuestions, ...deepQuestions];
        for (const question of questionMap) {
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
    } catch {
      setError("Could not load profile state.");
    } finally {
      setLoadingProgress(false);
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    const controller = new AbortController();

    async function logStepViewed() {
      await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          currentStep: questionIndex + 1,
          totalSteps,
          mode,
          completed: false
        }),
        signal: controller.signal
      }).catch(() => undefined);
    }

    if (!onboardingCompleted && !loadingProgress) {
      void logStepViewed();
    }

    return () => controller.abort();
  }, [questionIndex, totalSteps, mode, onboardingCompleted, loadingProgress]);

  const persistCurrentAnswer = useCallback(async (nextStep: number) => {
    const payload = {
      questionId: currentQuestion.id,
      value: currentQuestion.kind === "number" ? Number(currentValue) : currentValue,
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
      const data = (await response.json().catch(() => null)) as { error?: string; details?: { message?: string } } | null;
      throw new Error(`${data?.error ?? "Could not persist answer."} ${data?.details?.message ?? ""}`.trim());
    }
  }, [currentQuestion.id, currentQuestion.kind, currentValue, questionIndex, totalSteps, mode]);

  const handleAdvance = useCallback(async () => {
    if (!canContinue || isSubmittingAnswer) return;

    setIsSubmittingAnswer(true);
    setError(null);
    try {
      const nextStep = questionIndex + 2;
      await persistCurrentAnswer(nextStep);
      setQuestionIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Could not advance onboarding.";
      setError(message);
    } finally {
      setIsSubmittingAnswer(false);
    }
  }, [canContinue, isSubmittingAnswer, questionIndex, totalSteps, persistCurrentAnswer]);

  const handleSubmitOnboarding = useCallback(async () => {
    if (!canContinue || loading || isSubmittingAnswer) return;

    setLoading(true);
    setError(null);

    try {
      await persistCurrentAnswer(totalSteps + 1);

      const payload = {
        firstName: values.firstName,
        ageRange: values.ageRange,
        locationPreference: values.locationPreference,
        lookingFor: values.lookingFor,
        timelineMonths: Number(values.timelineMonths),
        readiness: Number(values.readiness),
        weeklyCapacity: Number(values.weeklyCapacity),
        attachment: {
          anxiety: values.attachmentAnxiety.map(Number),
          avoidance: values.attachmentAvoidance.map(Number)
        },
        conflict: {
          startupSoftness: Number(values.startupSoftness),
          repairAfterConflict: Number(values.repairAfterConflict)
        },
        regulation: {
          calmUnderStress: Number(values.calmUnderStress),
          pauseBeforeReacting: Number(values.pauseBeforeReacting)
        },
        personality: {
          openness: Number(values.openness),
          conscientiousness: Number(values.conscientiousness),
          extraversion: Number(values.extraversion),
          agreeableness: Number(values.agreeableness),
          emotionalStability: Number(values.emotionalStability)
        },
        noveltyPreference: Number(values.noveltyPreference)
      };

      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const res = (await response.json().catch(() => null)) as { error?: string; details?: { message?: string } } | null;
        setError(`${res?.error ?? "Could not save onboarding."} ${res?.details?.message ?? ""}`.trim());
        return;
      }

      const data = (await response.json()) as OnboardingResponse;
      setSaved(data);
      setSavedBanner("Onboarding saved successfully.");

      await fetch("/api/onboarding/progress", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ currentStep: totalSteps, totalSteps, mode, completed: true })
      });

      setTab("matches");
      await loadMatches();
    } finally {
      setLoading(false);
    }
  }, [canContinue, loading, isSubmittingAnswer, values, totalSteps, mode, persistCurrentAnswer]);

  async function loadMatches() {
    setError(null);
    const response = await fetch("/api/matches/preview", { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not load match results.");
      return;
    }
    const data = (await response.json()) as MatchResponse;
    setMatches(data.matches ?? []);
    setMatchesEmptyReason(data.emptyReason ?? null);
  }

  async function loadDiscover() {
    const response = await fetch("/api/discover", { cache: "no-store" });
    if (!response.ok) {
      setDiscoverCandidates([]);
      setDiscoverEmptyReason("Could not load Discover.");
      return;
    }
    const payload = (await response.json()) as DiscoverResponse;
    setDiscoverCandidates(payload.candidates ?? []);
    setDiscoverEmptyReason(payload.emptyReason ?? null);
  }

  async function createPairCode() {
    const response = await fetch("/api/pair-code/create", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ create: true })
    });

    if (!response.ok) {
      setError("Could not create pair code.");
      return;
    }

    const payload = (await response.json()) as { pairCode?: { code: string } };
    setPairCode(payload.pairCode?.code ?? null);
  }

  async function joinPairCode() {
    const response = await fetch("/api/pair-code/join", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ code: joinCode })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not join pair code.");
      return;
    }

    setJoinCode("");
    await loadDiscover();
    await loadMatches();
  }

  async function openThread(participantId: string) {
    setThreadParticipantId(participantId);
    const response = await fetch(`/api/chat/thread?participantId=${participantId}`, { cache: "no-store" });
    if (!response.ok) {
      setError("Could not load guided chat.");
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
      setError("Could not update chat.");
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
      setError("Could not reset onboarding.");
      return;
    }

    setValues(initialValues);
    setQuestionIndex(0);
    setSaved(null);
    setSavedBanner("Onboarding reset.");
    setTab("home");
    await hydrate();
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: await withCsrfHeaders() });
    window.location.href = "/login";
  }

  const profile = saved?.profile;
  const displayName = (profile?.firstName ?? values.firstName.trim()) || (firstName ?? "You");
  const showReset = typeof window !== "undefined" && (window.location.search.includes("dev=1") || process.env.NODE_ENV !== "production");

  return (
    <section className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Today</p>
        <h1>Hey, {displayName}</h1>
        {!onboardingCompleted ? (
          <div className="trust-chip">Finish setup to unlock Discover, Matches, and Guided Chat.</div>
        ) : (
          <div className="trust-chip">Profile complete. Continue your match conversations with Day-by-day prompts.</div>
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
                <h2>Next Action</h2>
                <p className="muted">{onboardingCompleted ? "Review your profile or open Matches." : `Continue onboarding at card ${questionIndex + 1} of ${totalSteps}.`}</p>
                <div className="actions">
                  {!onboardingCompleted ? (
                    <button type="button" onClick={() => setTab("home")}>Continue setup</button>
                  ) : (
                    <button type="button" onClick={() => setTab("matches")}>Open matches</button>
                  )}
                </div>
              </section>

              {!onboardingCompleted ? (
                <section className="panel onboarding-card elevated">
                  <div className="progress-wrap" aria-hidden="true">
                    <span className="progress-text">Card {questionIndex + 1} of {totalSteps}</span>
                    <div className="progress-track">
                      <motion.span className="progress-fill" initial={false} animate={{ width: `${progress}%` }} transition={{ duration: 0.2, ease: "easeOut" }} />
                    </div>
                  </div>

                  <div className="mode-picker" role="radiogroup" aria-label="Setup mode">
                    <button type="button" className={mode === "fast" ? "mode-chip active" : "mode-chip"} onClick={() => setMode("fast")} aria-pressed={mode === "fast"}>Fast</button>
                    <button type="button" className={mode === "deep" ? "mode-chip active" : "mode-chip"} onClick={() => setMode("deep")} aria-pressed={mode === "deep"}>Deep</button>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div key={currentQuestion.id} className="question-card stage-card" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
                      <p className="eyebrow">Onboarding</p>
                      <label className="question-label" htmlFor={currentQuestion.id}>{currentQuestion.title}</label>
                      <p className="muted">{currentQuestion.description}</p>
                      {currentQuestion.kind === "text" ? (
                        <input id={currentQuestion.id} value={currentValue} onChange={(event) => setValues((prev) => setFieldValue(prev, currentQuestion.field, event.target.value))} autoComplete="given-name" placeholder="Enter your first name" />
                      ) : null}
                      {currentQuestion.kind === "number" ? (
                        <div className="number-control">
                          <input id={currentQuestion.id} className="range-input" type="range" min={currentQuestion.min} max={currentQuestion.max} value={currentValue} onChange={(event) => setValues((prev) => setFieldValue(prev, currentQuestion.field, event.target.value))} />
                          <input type="number" min={currentQuestion.min} max={currentQuestion.max} value={currentValue} onChange={(event) => setValues((prev) => setFieldValue(prev, currentQuestion.field, event.target.value))} />
                        </div>
                      ) : null}
                      {currentQuestion.kind === "select" ? (
                        <div className="option-grid" role="group" aria-label={currentQuestion.title}>
                          {currentQuestion.options?.map((option) => (
                            <button key={option.value} type="button" className={currentValue === option.value ? "answer-chip active" : "answer-chip"} onClick={() => setValues((prev) => setFieldValue(prev, currentQuestion.field, option.value))} aria-pressed={currentValue === option.value}>{option.label}</button>
                          ))}
                        </div>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>

                  <div className="actions">
                    <button type="button" disabled={questionIndex === 0 || isSubmittingAnswer || loading} className="ghost" onClick={() => setQuestionIndex((prev) => Math.max(0, prev - 1))}>Previous</button>
                    {questionIndex < totalSteps - 1 ? (
                      <button type="button" disabled={!canContinue || isSubmittingAnswer || loading} onClick={handleAdvance}>{isSubmittingAnswer ? "Saving..." : "Continue"}</button>
                    ) : (
                      <button type="button" disabled={!canContinue || loading || isSubmittingAnswer} onClick={handleSubmitOnboarding}>{loading ? "Saving..." : "Save onboarding"}</button>
                    )}
                  </div>
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

          {tab === "discover" ? (
            <div className="stack">
              {!onboardingCompleted ? <section className="panel panel-tight"><p className="muted">Finish setup first to get accurate discovery.</p><div className="actions"><button type="button" onClick={() => setTab("home")}>Finish setup</button></div></section> : null}

              <section className="panel">
                <h2>Invite friend</h2>
                <p className="muted">Generate a pair code and ask your friend to join.</p>
                <div className="actions">
                  <button type="button" onClick={createPairCode}>Generate pair code</button>
                  {pairCode ? <span className="trust-chip">Code: {pairCode}</span> : null}
                </div>
                <label>
                  Join with code
                  <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="ABC1234" />
                </label>
                <div className="actions">
                  <button type="button" onClick={joinPairCode} disabled={joinCode.trim().length < 6}>Join code</button>
                  <button type="button" className="ghost" onClick={loadDiscover}>Refresh Discover</button>
                </div>
              </section>

              <section className="panel">
                <h3>Discover pool</h3>
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
                <p className="muted">Intent: {toLabel(profile?.intent.lookingFor ?? values.lookingFor)}</p>
                <div className="actions">
                  <button type="button" className="ghost" onClick={() => setTab("home")}>About You (edit onboarding)</button>
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
                  <button type="button" className="ghost" onClick={signOut}>Sign out</button>
                </div>
                <p className="muted tiny">User ID: {userId}</p>
              </section>
            </div>
          ) : null}

          {error ? (
            <section className="panel panel-tight">
              <p role="alert" className="inline-error">{error}</p>
            </section>
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
