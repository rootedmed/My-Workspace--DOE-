"use client";

import { useEffect, useState } from "react";

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

export function GuestCompatibilityForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostFirstName, setHostFirstName] = useState("your host");
  const [answers, setAnswers] = useState<Answers>(DEFAULT_ANSWERS);
  const [report, setReport] = useState<GuestReportResponse["report"]>(null);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      const response = await fetch(`/api/guest/${token}`, { cache: "no-store" });
      if (!response.ok) {
        if (!cancelled) {
          setError("This guest link is invalid or expired.");
          setLoading(false);
        }
        return;
      }
      const payload = (await response.json()) as GuestReportResponse;
      if (cancelled) return;
      setHostFirstName(payload.hostFirstName);
      setReport(payload.report ?? null);
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
        setError(payload?.error ?? "Could not submit guest answers.");
        return;
      }
      const payload = (await response.json()) as { report: GuestReportResponse["report"] };
      setReport(payload.report);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <section className="panel"><p className="muted">Loading guest session...</p></section>;
  }

  return (
    <>
      <section className="panel stack">
        <p className="eyebrow">Guest Compatibility</p>
        <h1>Compatibility with {hostFirstName}</h1>
        <p className="muted">Answer a short set of questions. No account required.</p>
      </section>

      {report ? (
        <section className="panel stack">
          <h2>Your compatibility score: {report.score}</h2>
          <p className="muted">Tier: {report.tier}</p>
          {report.report?.whatWillFeelEasy.map((item) => (
            <p key={item} className="small">✓ {item}</p>
          ))}
          {report.report?.whatWillTakeWork.map((item) => (
            <article key={item.issue} className="prompt-card">
              <p className="small"><strong>{item.issue}</strong></p>
              <p className="muted small">{item.explanation}</p>
              <p className="small">How to navigate this: "{item.script}"</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="panel stack">
        <label>
          Past reflection
          <select
            value={answers.past_attribution}
            onChange={(event) => setAnswers((prev) => ({ ...prev, past_attribution: event.target.value }))}
          >
            <option value="misaligned_goals">Different directions</option>
            <option value="conflict_comm">Communication</option>
            <option value="emotional_disconnect">Emotional distance</option>
            <option value="autonomy">Need for space</option>
            <option value="external">Timing and life</option>
          </select>
        </label>
        <label>
          Conflict speed (1-5)
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
          Emotional openness (1-5)
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
        <label>
          Support need
          <select
            value={answers.support_need}
            onChange={(event) => setAnswers((prev) => ({ ...prev, support_need: event.target.value }))}
          >
            <option value="validation">Validation</option>
            <option value="practical">Practical</option>
            <option value="presence">Presence</option>
            <option value="space">Space</option>
            <option value="distraction">Distraction</option>
          </select>
        </label>
        <label>
          Relationship vision
          <select
            value={answers.relationship_vision}
            onChange={(event) => setAnswers((prev) => ({ ...prev, relationship_vision: event.target.value }))}
          >
            <option value="independent">Independent together</option>
            <option value="enmeshed">Deeply intertwined</option>
            <option value="friendship">Best friendship</option>
            <option value="safe">Safe harbour</option>
            <option value="adventure">Shared adventure</option>
          </select>
        </label>
        <label>
          Growth intention
          <select
            value={answers.growth_intention}
            onChange={(event) => setAnswers((prev) => ({ ...prev, growth_intention: event.target.value }))}
          >
            <option value="depth">Deeper honesty</option>
            <option value="balance">Better balance</option>
            <option value="chosen">Being chosen</option>
            <option value="peace">Less conflict</option>
            <option value="alignment">Real alignment</option>
          </select>
        </label>
        <label>
          Lifestyle energy
          <select
            value={answers.lifestyle_energy}
            onChange={(event) => setAnswers((prev) => ({ ...prev, lifestyle_energy: event.target.value }))}
          >
            <option value="introspective">Quiet indie film</option>
            <option value="high_energy">Action blockbuster</option>
            <option value="social">Rom-com marathon</option>
            <option value="intellectual">Documentary deep-dive</option>
            <option value="spontaneous">Whatever&apos;s playing</option>
          </select>
        </label>

        <div className="stack">
          <p className="small"><strong>Love expression (pick up to 2)</strong></p>
          <div className="actions">
            {["acts", "time", "words", "physical", "gifts"].map((value) => (
              <button
                key={value}
                type="button"
                className={answers.love_expression.includes(value) ? "" : "ghost"}
                onClick={() => toggleMulti("love_expression", value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <div className="stack">
          <p className="small"><strong>Relational strengths (pick up to 2)</strong></p>
          <div className="actions">
            {["consistency", "loyalty", "honesty", "joy", "support"].map((value) => (
              <button
                key={value}
                type="button"
                className={answers.relational_strengths.includes(value) ? "" : "ghost"}
                onClick={() => toggleMulti("relational_strengths", value)}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="inline-error">{error}</p> : null}
        <div className="actions">
          <button type="button" onClick={() => void submit()} disabled={submitting}>
            {submitting ? "Submitting..." : "Generate Compatibility Report"}
          </button>
        </div>
      </section>
    </>
  );
}
