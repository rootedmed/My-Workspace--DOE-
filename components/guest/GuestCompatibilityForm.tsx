"use client";

import { useEffect, useMemo, useState } from "react";
import { trackUxEvent } from "@/lib/observability/uxClient";

type GuestReportResponse = {
  hostFirstName: string;
  hasSubmitted: boolean;
  report: {
    score: number;
    tier: string;
    notes: string[];
    warnings: string[];
    report: {
      whatWillFeelEasy: string[];
      whatWillTakeWork: Array<{ issue: string; explanation: string; script: string }>;
    } | null;
  } | null;
  expiresAt: string;
};

type Answers = {
  past_attribution: string;
  conflict_speed: number;
  love_expression: string[];
  support_need: string;
  emotional_openness: number;
  relationship_vision: string;
  relational_strengths: string[];
  growth_intention: string;
  lifestyle_energy: string;
};

const DEFAULT_ANSWERS: Answers = {
  past_attribution: "misaligned_goals",
  conflict_speed: 3,
  love_expression: ["time", "acts"],
  support_need: "validation",
  emotional_openness: 3,
  relationship_vision: "friendship",
  relational_strengths: ["consistency", "honesty"],
  growth_intention: "alignment",
  lifestyle_energy: "social"
};

const pastOptions = [
  { value: "misaligned_goals", label: "Different directions" },
  { value: "conflict_comm", label: "Communication" },
  { value: "emotional_disconnect", label: "Emotional distance" },
  { value: "autonomy", label: "Need for space" },
  { value: "external", label: "Timing and life" }
];

const supportOptions = [
  { value: "validation", label: "Validation" },
  { value: "practical", label: "Practical support" },
  { value: "presence", label: "Physical presence" },
  { value: "space", label: "Space first" },
  { value: "distraction", label: "Light distraction" }
];

const visionOptions = [
  { value: "independent", label: "Independent together" },
  { value: "enmeshed", label: "Deeply intertwined" },
  { value: "friendship", label: "Best friendship" },
  { value: "safe", label: "Safe harbour" },
  { value: "adventure", label: "Shared adventure" }
];

const growthOptions = [
  { value: "depth", label: "Deeper honesty" },
  { value: "balance", label: "Better balance" },
  { value: "chosen", label: "Being chosen" },
  { value: "peace", label: "Less conflict" },
  { value: "alignment", label: "Real alignment" }
];

const energyOptions = [
  { value: "introspective", label: "Quiet indie film" },
  { value: "high_energy", label: "Action blockbuster" },
  { value: "social", label: "Rom-com marathon" },
  { value: "intellectual", label: "Documentary deep-dive" },
  { value: "spontaneous", label: "Whatever's playing" }
];

const loveOptions = [
  { value: "acts", label: "Acts of care" },
  { value: "time", label: "Quality presence" },
  { value: "words", label: "Words & affirmation" },
  { value: "physical", label: "Physical closeness" },
  { value: "gifts", label: "Thoughtful surprises" }
];

const strengthsOptions = [
  { value: "consistency", label: "Consistency" },
  { value: "loyalty", label: "Loyalty" },
  { value: "honesty", label: "Honesty" },
  { value: "joy", label: "Joy" },
  { value: "support", label: "Championing" }
];

const conflictSpeedLabels: Record<number, string> = {
  1: "Talk now",
  2: "Lean in",
  3: "Balanced",
  4: "Step back",
  5: "Space first"
};

const opennessLabels: Record<number, string> = {
  1: "Very open",
  2: "Open with trust",
  3: "Balanced",
  4: "Selective",
  5: "Self-contained"
};

export function GuestCompatibilityForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostFirstName, setHostFirstName] = useState("your host");
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [report, setReport] = useState<GuestReportResponse["report"]>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [sessionFound, setSessionFound] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const scoreTier = useMemo(() => {
    if (!report) return null;
    if (report.score >= 82) return "Excellent fit";
    if (report.score >= 68) return "Promising fit";
    return "Worth exploring";
  }, [report]);

  useEffect(() => {
    trackUxEvent("guest_form_viewed");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      setLoading(true);
      const response = await fetch(`/api/guest/${token}`, { cache: "no-store" });
      if (!response.ok) {
        if (!cancelled) {
          setError("This guest link is invalid or expired.");
          setSessionFound(false);
          setLoading(false);
        }
        return;
      }

      const payload = (await response.json()) as GuestReportResponse;
      if (cancelled) return;
      setHostFirstName(payload.hostFirstName);
      setReport(payload.report ?? null);
      setExpiresAt(payload.expiresAt);
      setHasSubmitted(Boolean(payload.hasSubmitted));
      setSessionFound(true);
      setLoading(false);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function toggleMulti(field: "love_expression" | "relational_strengths", value: string, max = 2) {
    setAnswers((prev) => {
      const current = prev[field];
      if (current.includes(value)) {
        return { ...prev, [field]: current.filter((item) => item !== value) };
      }
      if (current.length >= max) return prev;
      return { ...prev, [field]: [...current, value] };
    });
  }

  async function submit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/guest/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers)
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        trackUxEvent("guest_form_submit_failed", { has_server_message: Boolean(payload?.error) });
        setError(payload?.error ?? "Could not submit guest answers.");
        return;
      }
      const payload = (await response.json()) as { report: GuestReportResponse["report"] };
      setReport(payload.report);
      setHasSubmitted(true);
      trackUxEvent("guest_form_submitted");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">Loading guest session...</p>
      </section>
    );
  }

  if (!sessionFound) {
    return (
      <section className="panel stack">
        <p className="eyebrow">Guest Compatibility</p>
        <h1>Link unavailable</h1>
        <p role="alert" className="inline-error">{error ?? "This guest link is no longer available."}</p>
      </section>
    );
  }

  return (
    <>
      <section className="panel stack guest-public-hero">
        <p className="eyebrow">Guest Compatibility</p>
        <h1>Compatibility with {hostFirstName}</h1>
        <p className="muted">
          Answer a focused set of prompts. You will get a clear snapshot of what feels easy and what needs intention.
        </p>
        {hasSubmitted ? <p className="tiny inline-ok">You already submitted once. You can update your answers below.</p> : null}
        {expiresAt ? <p className="tiny muted">Link expires {new Date(expiresAt).toLocaleString()}</p> : null}
      </section>

      {report ? (
        <section className="panel stack">
          <div className="guest-score-head">
            <div>
              <p className="eyebrow">Current Snapshot</p>
              <h2>{report.score}</h2>
            </div>
            <span className="trust-chip">{scoreTier ?? report.tier}</span>
          </div>

          {(report.notes ?? []).slice(0, 3).map((note) => (
            <p key={note} className="small">✓ {note}</p>
          ))}
          {(report.warnings ?? []).slice(0, 2).map((warning) => (
            <p key={warning} className="small">⚠ {warning}</p>
          ))}

          {report.report?.whatWillTakeWork.map((item) => (
            <article key={item.issue} className="prompt-card">
              <p className="small"><strong>{item.issue}</strong></p>
              <p className="muted small">{item.explanation}</p>
              <p className="small">How to navigate this: &quot;{item.script}&quot;</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="panel stack">
        <h2>Your answers</h2>

        <div className="guest-form-grid">
          <label>
            Past reflection
            <select
              value={answers.past_attribution}
              onChange={(event) => setAnswers((prev) => ({ ...prev, past_attribution: event.target.value }))}
            >
              {pastOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Support need
            <select
              value={answers.support_need}
              onChange={(event) => setAnswers((prev) => ({ ...prev, support_need: event.target.value }))}
            >
              {supportOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Relationship vision
            <select
              value={answers.relationship_vision}
              onChange={(event) => setAnswers((prev) => ({ ...prev, relationship_vision: event.target.value }))}
            >
              {visionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Growth intention
            <select
              value={answers.growth_intention}
              onChange={(event) => setAnswers((prev) => ({ ...prev, growth_intention: event.target.value }))}
            >
              {growthOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label>
            Lifestyle energy
            <select
              value={answers.lifestyle_energy}
              onChange={(event) => setAnswers((prev) => ({ ...prev, lifestyle_energy: event.target.value }))}
            >
              {energyOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="guest-range-row">
          <label>
            Conflict pace ({conflictSpeedLabels[answers.conflict_speed]})
            <input
              className="range-input"
              type="range"
              min={1}
              max={5}
              step={1}
              value={answers.conflict_speed}
              onChange={(event) => setAnswers((prev) => ({ ...prev, conflict_speed: Number(event.target.value) }))}
            />
          </label>

          <label>
            Emotional openness ({opennessLabels[answers.emotional_openness]})
            <input
              className="range-input"
              type="range"
              min={1}
              max={5}
              step={1}
              value={answers.emotional_openness}
              onChange={(event) => setAnswers((prev) => ({ ...prev, emotional_openness: Number(event.target.value) }))}
            />
          </label>
        </div>

        <div className="stack">
          <p className="small"><strong>Love expression (pick up to 2)</strong></p>
          <div className="filter-strip">
            {loveOptions.map((option) => {
              const isSelected = answers.love_expression.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={isSelected ? "filter-chip active" : "filter-chip"}
                  aria-pressed={isSelected}
                  onClick={() => toggleMulti("love_expression", option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="stack">
          <p className="small"><strong>Relational strengths (pick up to 2)</strong></p>
          <div className="filter-strip">
            {strengthsOptions.map((option) => {
              const isSelected = answers.relational_strengths.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  className={isSelected ? "filter-chip active" : "filter-chip"}
                  aria-pressed={isSelected}
                  onClick={() => toggleMulti("relational_strengths", option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {error ? <p className="inline-error">{error}</p> : null}
        <div className="actions">
          <button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Submitting..." : "Generate compatibility snapshot"}
          </button>
        </div>
      </section>
    </>
  );
}
