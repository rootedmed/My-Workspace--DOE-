"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { DecisionTrack, MatchResult, OnboardingProfile } from "@/lib/domain/types";
import { getClosureTemplate, getNudge } from "@/lib/decision-track/stateMachine";
import { withCsrfHeaders } from "@/components/auth/csrf";

type WizardMode = "fast" | "deep";
type AppTab = "discover" | "matches" | "profile";

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
};

type DecisionTrackResponse = {
  track: DecisionTrack;
  prompt: string;
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

function scoreLabel(score: number): string {
  if (score >= 70) {
    return "Strong";
  }
  if (score >= 50) {
    return "Balanced";
  }
  return "Developing";
}

export function OnboardingFlow({ userId, firstName }: OnboardingFlowProps) {
  const [tab, setTab] = useState<AppTab>("discover");
  const [mode, setMode] = useState<WizardMode>("fast");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [values, setValues] = useState<WizardValues>(initialValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<OnboardingResponse | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [track, setTrack] = useState<DecisionTrackResponse | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const questions = useMemo(() => {
    if (mode === "fast") {
      return fastQuestions;
    }
    return [...fastQuestions, ...deepQuestions];
  }, [mode]);

  const currentQuestion = questions[questionIndex] ?? questions[0]!;
  const progress = ((questionIndex + 1) / questions.length) * 100;

  useEffect(() => {
    setQuestionIndex((prev) => Math.min(prev, questions.length - 1));
  }, [questions.length]);

  const canContinue = useMemo(() => {
    const value = getFieldValue(values, currentQuestion.field).trim();
    if (currentQuestion.field === "firstName") {
      return value.length >= 2;
    }

    if (currentQuestion.kind === "number") {
      const parsed = Number(value);
      if (Number.isNaN(parsed)) {
        return false;
      }
      if (typeof currentQuestion.min === "number" && parsed < currentQuestion.min) {
        return false;
      }
      if (typeof currentQuestion.max === "number" && parsed > currentQuestion.max) {
        return false;
      }
    }

    return value.length > 0;
  }, [currentQuestion, values]);

  async function submitOnboarding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

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

    try {
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        setError("Could not save onboarding. Please review your entries.");
        return;
      }

      const data = (await response.json()) as OnboardingResponse;
      setSaved(data);
      setSavedBanner("Onboarding saved successfully.");
      setTab("matches");
    } catch {
      setError("Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMatches() {
    setError(null);
    const response = await fetch("/api/matches/preview");
    if (!response.ok) {
      setError("Could not load matches right now.");
      return;
    }
    const data = (await response.json()) as MatchResponse;
    setMatches(data.matches);
  }

  async function startTrack() {
    setError(null);
    const response = await fetch("/api/decision-track/start", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ start: true })
    });
    if (!response.ok) {
      setError("Could not start decision track.");
      return;
    }
    const data = (await response.json()) as DecisionTrackResponse;
    setTrack(data);
  }

  async function advanceTrack(action: "complete_reflection" | "advance_day") {
    if (!track?.track.id) {
      return;
    }
    setError(null);
    const response = await fetch("/api/decision-track/advance", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ trackId: track.track.id, action })
    });
    if (!response.ok) {
      setError("Could not update decision track.");
      return;
    }
    const data = (await response.json()) as DecisionTrackResponse;
    setTrack(data);
  }

  async function sendCalibration(feltRight: number) {
    await fetch("/api/matches/calibration", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ feltRight })
    });
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST", headers: await withCsrfHeaders() });
    window.location.href = "/login";
  }

  const profile = saved?.profile;
  const displayName = (profile?.firstName ?? values.firstName.trim()) || (firstName ?? "You");

  return (
    <section className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Discover</p>
        <h1>Hey, {displayName}</h1>
        <p className="muted">Intent-first dating with calm, premium pacing.</p>
        <div className="trust-chip">High-trust matching. No swipe mechanics.</div>
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
          {tab === "discover" ? (
            <div className="stack">
              <section className="panel panel-tight">
                <div className="mode-picker" role="radiogroup" aria-label="Setup mode">
                  <button
                    type="button"
                    className={mode === "fast" ? "mode-chip active" : "mode-chip"}
                    onClick={() => setMode("fast")}
                    aria-pressed={mode === "fast"}
                  >
                    Fast
                  </button>
                  <button
                    type="button"
                    className={mode === "deep" ? "mode-chip active" : "mode-chip"}
                    onClick={() => setMode("deep")}
                    aria-pressed={mode === "deep"}
                  >
                    Deep
                  </button>
                </div>
                <p className="muted small">{mode === "fast" ? "3-card sprint" : "20-card precision onboarding"}</p>
              </section>

              <form onSubmit={submitOnboarding} className="stack">
                <section className="panel onboarding-card">
                  <div className="progress-wrap" aria-hidden="true">
                    <span className="progress-text">
                      Card {questionIndex + 1} of {questions.length}
                    </span>
                    <div className="progress-track">
                      <motion.span
                        className="progress-fill"
                        initial={false}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      />
                    </div>
                  </div>

                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={currentQuestion.id}
                      className="question-card"
                      initial={{ opacity: 0, x: 16 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -16 }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <label className="question-label" htmlFor={currentQuestion.id}>
                        {currentQuestion.title}
                      </label>
                      <p className="muted">{currentQuestion.description}</p>
                      {currentQuestion.kind === "text" ? (
                        <input
                          id={currentQuestion.id}
                          value={getFieldValue(values, currentQuestion.field)}
                          onChange={(event) =>
                            setValues((prev) => setFieldValue(prev, currentQuestion.field, event.target.value))
                          }
                          autoComplete="given-name"
                        />
                      ) : null}
                      {currentQuestion.kind === "number" ? (
                        <input
                          id={currentQuestion.id}
                          type="number"
                          min={currentQuestion.min}
                          max={currentQuestion.max}
                          value={getFieldValue(values, currentQuestion.field)}
                          onChange={(event) =>
                            setValues((prev) => setFieldValue(prev, currentQuestion.field, event.target.value))
                          }
                        />
                      ) : null}
                      {currentQuestion.kind === "select" ? (
                        <select
                          id={currentQuestion.id}
                          value={getFieldValue(values, currentQuestion.field)}
                          onChange={(event) =>
                            setValues((prev) => setFieldValue(prev, currentQuestion.field, event.target.value))
                          }
                        >
                          {currentQuestion.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : null}

                      {currentQuestion.field === "firstName" &&
                      values.firstName.trim().length > 0 &&
                      values.firstName.trim().length < 2 ? (
                        <p className="inline-error">Name should be at least 2 characters.</p>
                      ) : null}
                    </motion.div>
                  </AnimatePresence>

                  <div className="actions">
                    <button
                      type="button"
                      disabled={questionIndex === 0 || loading}
                      onClick={() => setQuestionIndex((prev) => prev - 1)}
                      className="ghost"
                    >
                      Previous
                    </button>
                    {questionIndex < questions.length - 1 ? (
                      <button
                        type="button"
                        disabled={!canContinue || loading}
                        onClick={() => setQuestionIndex((prev) => prev + 1)}
                      >
                        Continue
                      </button>
                    ) : (
                      <button type="submit" disabled={loading || !canContinue}>
                        {loading ? "Saving..." : "Save onboarding"}
                      </button>
                    )}
                  </div>
                </section>
              </form>

              {savedBanner ? <p className="inline-ok">{savedBanner}</p> : null}
              <section className="panel panel-tight">
                <div className="actions">
                  <button type="button" className="ghost" onClick={signOut}>
                    Sign out
                  </button>
                </div>
                <p className="muted tiny">User ID: {userId}</p>
              </section>
            </div>
          ) : null}

          {tab === "matches" ? (
            <div className="stack">
              <section className="panel">
                <h2>Match Preview</h2>
                <p className="muted">Compatibility previews remain read-only in this phase.</p>
                <div className="actions">
                  <button type="button" onClick={loadMatches} disabled={!saved}>
                    See compatibility preview
                  </button>
                  <button type="button" onClick={startTrack} disabled={!saved}>
                    Start 14-day decision track
                  </button>
                </div>
              </section>

              {!saved ? (
                <section className="panel panel-tight">
                  <p className="muted">Complete onboarding in Discover to unlock matches.</p>
                </section>
              ) : null}

              {saved ? (
                <section className="panel">
                  <h3>Your tendencies</h3>
                  <ul className="list">
                    {saved.tendenciesSummary.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {matches.length > 0 ? (
                <section className="stack">
                  {matches.map((match) => (
                    <article key={match.candidateId} className="panel">
                      <p className="eyebrow">{match.totalScore}/100 match</p>
                      <h3>{match.candidateFirstName}</h3>
                      <p className="muted">Top fit signals</p>
                      <ul className="list">
                        {match.topFitReasons.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <p className="muted">Potential friction points</p>
                      <ul className="list">
                        {match.potentialFrictionPoints.map((reason) => (
                          <li key={reason}>{reason}</li>
                        ))}
                      </ul>
                      <div className="actions">
                        <button type="button" onClick={() => sendCalibration(5)}>
                          Felt right
                        </button>
                        <button type="button" className="ghost" onClick={() => sendCalibration(2)}>
                          Felt off
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ) : null}

              {track ? (
                <section className="panel">
                  <h3>Decision Track</h3>
                  <p className="muted">
                    State: {track.track.state} | Day: {track.track.day}
                  </p>
                  <p>{track.prompt}</p>
                  <p className="muted">{getNudge(track.track.state, track.track.day)}</p>
                  <div className="actions">
                    <button type="button" onClick={() => advanceTrack("complete_reflection")}>
                      Complete reflection
                    </button>
                    <button type="button" className="ghost" onClick={() => advanceTrack("advance_day")}>
                      Advance day
                    </button>
                  </div>
                  <details>
                    <summary>Respectful close-the-loop templates</summary>
                    <ul className="list">
                      <li>{getClosureTemplate("continue")}</li>
                      <li>{getClosureTemplate("pause")}</li>
                      <li>{getClosureTemplate("close")}</li>
                    </ul>
                  </details>
                </section>
              ) : null}
            </div>
          ) : null}

          {tab === "profile" ? (
            <div className="stack">
              <section className="panel profile-hero">
                <p className="eyebrow">Profile</p>
                <h2>{displayName}</h2>
                <p className="muted">Intent: {toLabel(profile?.intent.lookingFor ?? values.lookingFor)}</p>
                <div className="profile-meta">
                  <span className="meta-pill">{toLabel(profile?.ageRange ?? values.ageRange)}</span>
                  <span className="meta-pill">{toLabel(profile?.locationPreference ?? values.locationPreference)}</span>
                </div>
              </section>

              <section className="panel">
                <h3>Photo placeholders</h3>
                <p className="muted">Visual slots for profile photos. Upload flow comes next phase.</p>
                <div className="photo-grid" aria-label="Profile photo placeholders">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <article key={`photo-${index}`} className="photo-slot">
                      <span>Photo {index + 1}</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel">
                <h3>Prompts</h3>
                <div className="prompt-grid">
                  <article className="prompt-card">
                    <p className="prompt-q">My relationship pace works best when...</p>
                    <p>
                      we align on a {profile?.intent.timelineMonths ?? Number(values.timelineMonths)}-month timeline and
                      keep dating consistent.
                    </p>
                  </article>
                  <article className="prompt-card">
                    <p className="prompt-q">A green flag for me is...</p>
                    <p>
                      someone who scores {scoreLabel(profile?.tendencies.conflictRepair ?? Number(values.repairAfterConflict) * 20)} in
                      repair habits after conflict.
                    </p>
                  </article>
                  <article className="prompt-card">
                    <p className="prompt-q">I feel most connected when...</p>
                    <p>
                      both people respect emotional pacing and communication style ({toLabel(
                        profile?.locationPreference ?? values.locationPreference
                      )}).
                    </p>
                  </article>
                </div>
              </section>

              <section className="panel">
                <h3>Structured Snapshot</h3>
                <div className="stats-grid">
                  <article className="metric">
                    <span>Readiness</span>
                    <strong>{profile?.intent.readiness ?? Number(values.readiness)}/5</strong>
                  </article>
                  <article className="metric">
                    <span>Weekly capacity</span>
                    <strong>{profile?.intent.weeklyCapacity ?? Number(values.weeklyCapacity)} dates</strong>
                  </article>
                  <article className="metric">
                    <span>Attachment anxiety</span>
                    <strong>{profile?.tendencies.attachmentAnxiety ?? Number(values.attachmentAnxiety[0]) * 20}</strong>
                  </article>
                  <article className="metric">
                    <span>Emotional regulation</span>
                    <strong>{profile?.tendencies.emotionalRegulation ?? Number(values.pauseBeforeReacting) * 20}</strong>
                  </article>
                </div>
              </section>
            </div>
          ) : null}

          {error ? (
            <section className="panel panel-tight">
              <p role="alert" className="inline-error">
                {error}
              </p>
            </section>
          ) : null}
        </motion.div>
      </AnimatePresence>

      <nav className="bottom-nav" aria-label="Main">
        <button
          type="button"
          className={tab === "discover" ? "nav-item active" : "nav-item"}
          onClick={() => setTab("discover")}
        >
          <span>Discover</span>
        </button>
        <button
          type="button"
          className={tab === "matches" ? "nav-item active" : "nav-item"}
          onClick={() => setTab("matches")}
        >
          <span>Matches</span>
        </button>
        <button
          type="button"
          className={tab === "profile" ? "nav-item active" : "nav-item"}
          onClick={() => setTab("profile")}
        >
          <span>Profile</span>
        </button>
      </nav>
    </section>
  );
}
