"use client";

import { FormEvent, useMemo, useState } from "react";
import type { DecisionTrack, MatchResult, OnboardingProfile } from "@/lib/domain/types";
import { getClosureTemplate, getNudge } from "@/lib/decision-track/stateMachine";
import { withCsrfHeaders } from "@/components/auth/csrf";

type WizardMode = "fast" | "deep";

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

function LikertField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="1">1 - rarely true</option>
        <option value="2">2</option>
        <option value="3">3</option>
        <option value="4">4</option>
        <option value="5">5 - often true</option>
      </select>
    </label>
  );
}

type OnboardingFlowProps = {
  userId: string;
};

export function OnboardingFlow({ userId }: OnboardingFlowProps) {
  const [mode, setMode] = useState<WizardMode>("fast");
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<WizardValues>(initialValues);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<OnboardingResponse | null>(null);
  const [matches, setMatches] = useState<MatchResult[]>([]);
  const [track, setTrack] = useState<DecisionTrackResponse | null>(null);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);

  const totalSteps = mode === "fast" ? 3 : 4;

  const canContinue = useMemo(() => {
    if (step === 1) {
      return values.firstName.trim().length >= 2;
    }
    return true;
  }, [step, values.firstName]);

  const stepTitle = useMemo(() => {
    if (step === 1) {
      return "Intent and timeline";
    }
    if (step === 2) {
      return "Lifestyle fit";
    }
    if (step === 3) {
      return "Patterns and preferences";
    }
    return "Deep dive for better precision";
  }, [step]);

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
    } catch {
      setError("Request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMatches() {
    const response = await fetch("/api/matches/preview");
    if (!response.ok) {
      setError("Could not load matches right now.");
      return;
    }
    const data = (await response.json()) as MatchResponse;
    setMatches(data.matches);
  }

  async function startTrack() {
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

  return (
    <section className="panel">
      <h2>Adaptive Onboarding</h2>
      <p className="muted">
        User: {userId}. This is a non-clinical reflection tool and does not provide diagnosis or therapy.
      </p>
      <div className="actions">
        <button type="button" onClick={signOut}>
          Sign out
        </button>
      </div>

      <div className="panel">
        <h3>Setup mode</h3>
        <label>
          <input type="radio" checked={mode === "fast"} onChange={() => setMode("fast")} />
          Fast setup (fewer questions)
        </label>
        <label>
          <input type="radio" checked={mode === "deep"} onChange={() => setMode("deep")} />
          Deep dive (higher precision)
        </label>
      </div>

      <h3>{stepTitle}</h3>
      <p className="muted">
        Step {step} of {totalSteps}
      </p>
      {savedBanner ? <p className="inline-ok">{savedBanner}</p> : null}

      <form onSubmit={submitOnboarding}>
        <div key={`${mode}-${step}`} className="step-card">
          {step === 1 ? (
          <>
            <label>
              First name
              <input
                value={values.firstName}
                onChange={(event) => setValues((prev) => ({ ...prev, firstName: event.target.value }))}
              />
            </label>
            {values.firstName.trim().length > 0 && values.firstName.trim().length < 2 ? (
              <p className="inline-error">Name should be at least 2 characters.</p>
            ) : null}
            <label>
              What are you looking for?
              <select
                value={values.lookingFor}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    lookingFor: event.target.value as WizardValues["lookingFor"]
                  }))
                }
              >
                <option value="marriage_minded">Marriage-minded</option>
                <option value="serious_relationship">Serious relationship</option>
                <option value="exploring">Exploring</option>
              </select>
            </label>
            <label>
              Preferred commitment timeline (months)
              <input
                type="number"
                min={3}
                max={60}
                value={values.timelineMonths}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, timelineMonths: event.target.value }))
                }
              />
            </label>
          </>
          ) : null}

          {step === 2 ? (
          <>
            <label>
              Commitment readiness (1-5)
              <input
                type="number"
                min={1}
                max={5}
                value={values.readiness}
                onChange={(event) => setValues((prev) => ({ ...prev, readiness: event.target.value }))}
              />
            </label>
            <label>
              Weekly dating capacity
              <input
                type="number"
                min={1}
                max={7}
                value={values.weeklyCapacity}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, weeklyCapacity: event.target.value }))
                }
              />
            </label>
            <label>
              Age range
              <select
                value={values.ageRange}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, ageRange: event.target.value as WizardValues["ageRange"] }))
                }
              >
                <option value="24_30">24-30</option>
                <option value="31_37">31-37</option>
                <option value="38_45">38-45</option>
                <option value="46_plus">46+</option>
              </select>
            </label>
            <label>
              Location preference
              <select
                value={values.locationPreference}
                onChange={(event) =>
                  setValues((prev) => ({
                    ...prev,
                    locationPreference: event.target.value as WizardValues["locationPreference"]
                  }))
                }
              >
                <option value="same_city">Same city</option>
                <option value="relocatable">Relocatable</option>
                <option value="remote_ok">Remote okay</option>
              </select>
            </label>
          </>
          ) : null}

          {step === 3 ? (
          <>
            <LikertField
              label="I worry about losing connection."
              value={values.attachmentAnxiety[0]}
              onChange={(next) =>
                setValues((prev) => ({
                  ...prev,
                  attachmentAnxiety: [next, prev.attachmentAnxiety[1], prev.attachmentAnxiety[2]]
                }))
              }
            />
            <LikertField
              label="I need reassurance when plans feel uncertain."
              value={values.attachmentAnxiety[1]}
              onChange={(next) =>
                setValues((prev) => ({
                  ...prev,
                  attachmentAnxiety: [prev.attachmentAnxiety[0], next, prev.attachmentAnxiety[2]]
                }))
              }
            />
            <LikertField
              label="I need space before discussing intense feelings."
              value={values.attachmentAvoidance[1]}
              onChange={(next) =>
                setValues((prev) => ({
                  ...prev,
                  attachmentAvoidance: [prev.attachmentAvoidance[0], next, prev.attachmentAvoidance[2]]
                }))
              }
            />
            <LikertField
              label="I actively repair after conflict."
              value={values.repairAfterConflict}
              onChange={(next) => setValues((prev) => ({ ...prev, repairAfterConflict: next }))}
            />
            <LikertField
              label="I pause before reacting emotionally."
              value={values.pauseBeforeReacting}
              onChange={(next) => setValues((prev) => ({ ...prev, pauseBeforeReacting: next }))}
            />
          </>
          ) : null}

          {mode === "deep" && step === 4 ? (
          <>
            <LikertField
              label="I start difficult conversations gently."
              value={values.startupSoftness}
              onChange={(next) => setValues((prev) => ({ ...prev, startupSoftness: next }))}
            />
            <LikertField
              label="I stay calm under stress."
              value={values.calmUnderStress}
              onChange={(next) => setValues((prev) => ({ ...prev, calmUnderStress: next }))}
            />
            <LikertField
              label="Openness to new ideas"
              value={values.openness}
              onChange={(next) => setValues((prev) => ({ ...prev, openness: next }))}
            />
            <LikertField
              label="Conscientiousness"
              value={values.conscientiousness}
              onChange={(next) => setValues((prev) => ({ ...prev, conscientiousness: next }))}
            />
            <LikertField
              label="Extraversion"
              value={values.extraversion}
              onChange={(next) => setValues((prev) => ({ ...prev, extraversion: next }))}
            />
            <LikertField
              label="Agreeableness"
              value={values.agreeableness}
              onChange={(next) => setValues((prev) => ({ ...prev, agreeableness: next }))}
            />
            <LikertField
              label="Emotional stability"
              value={values.emotionalStability}
              onChange={(next) => setValues((prev) => ({ ...prev, emotionalStability: next }))}
            />
            <LikertField
              label="Novelty preference"
              value={values.noveltyPreference}
              onChange={(next) => setValues((prev) => ({ ...prev, noveltyPreference: next }))}
            />
          </>
          ) : null}
        </div>

        <div className="actions">
          <button type="button" disabled={step === 1 || loading} onClick={() => setStep((prev) => prev - 1)}>
            Edit previous
          </button>
          {step < totalSteps ? (
            <button type="button" disabled={!canContinue || loading} onClick={() => setStep((prev) => prev + 1)}>
              Continue
            </button>
          ) : (
            <button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save onboarding"}
            </button>
          )}
        </div>
      </form>

      {error ? <p role="alert">{error}</p> : null}

      {saved ? (
        <div className="panel">
          <h3>Your tendencies</h3>
          <ul className="list">
            {saved.tendenciesSummary.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <div className="actions">
            <button type="button" onClick={loadMatches}>
              See compatibility preview
            </button>
            <button type="button" onClick={startTrack}>
              Start 14-day decision track
            </button>
          </div>
        </div>
      ) : null}

      {matches.length > 0 ? (
        <div className="panel">
          <h3>Top compatibility previews</h3>
          {matches.map((match) => (
            <article key={match.candidateId} className="track-day">
              <strong>
                {match.candidateFirstName} - {match.totalScore}/100
              </strong>
              <p className="muted">Top fit signals:</p>
              <ul className="list">
                {match.topFitReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="muted">Potential friction points:</p>
              <ul className="list">
                {match.potentialFrictionPoints.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="muted">Suggested prompts:</p>
              <ul className="list">
                {match.conversationPrompts.map((prompt) => (
                  <li key={prompt}>{prompt}</li>
                ))}
              </ul>
              <div className="actions">
                <button type="button" onClick={() => sendCalibration(5)}>
                  Felt right
                </button>
                <button type="button" onClick={() => sendCalibration(2)}>
                  Felt off
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {track ? (
        <div className="panel">
          <h3>Decision Track</h3>
          <p>
            State: {track.track.state} | Day: {track.track.day}
          </p>
          <p>{track.prompt}</p>
          <p className="muted">{getNudge(track.track.state, track.track.day)}</p>
          <div className="actions">
            <button type="button" onClick={() => advanceTrack("complete_reflection")}>
              Complete reflection
            </button>
            <button type="button" onClick={() => advanceTrack("advance_day")}>
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
        </div>
      ) : null}
    </section>
  );
}
