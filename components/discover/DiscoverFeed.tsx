"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { withCsrfHeaders } from "@/components/auth/csrf";

type Candidate = {
  id: string;
  firstName: string;
  ageRange: string;
  locationPreference: string;
  photoUrl: string | null;
  compatibilityHighlight: string;
  watchForInsight: string;
  likedYou: boolean;
  understandingMatch: {
    matchName: string;
    score: number;
    whatWillFeelEasy: string[];
    whatWillTakeWork: Array<{
      issue: string;
      explanation: string;
      script: string;
    }>;
  } | null;
};

type DiscoverResponse = {
  candidates: Candidate[];
  incomingLikes: Candidate[];
  emptyReason?: string | null;
  filters?: { lookingFor?: string; locationPreference?: string };
};

type MatchInsightsResponse = {
  revealedPreferences?: {
    sampleSize: number;
    statedVsRevealed: Array<{
      trait: string;
      statedPreference: string | number | null;
      revealedPreference: string | number | null;
      confidence: number;
    }>;
  };
};

type MatchWeights = {
  attachment: number;
  conflict: number;
  vision: number;
  expression: number;
  lifestyle: number;
};

async function postSwipe(candidateId: string, action: "like" | "pass") {
  const response = await fetch("/api/discover", {
    method: "POST",
    headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ candidateId, action })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not save swipe.");
  }

  return (await response.json()) as { matched?: boolean; candidateFirstName?: string };
}

export function DiscoverFeed() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [incomingLikes, setIncomingLikes] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [filterLookingFor, setFilterLookingFor] = useState("");
  const [filterLocation, setFilterLocation] = useState("");
  const [matchBanner, setMatchBanner] = useState<string | null>(null);
  const [insights, setInsights] = useState<MatchInsightsResponse["revealedPreferences"] | null>(null);
  const [weights, setWeights] = useState<MatchWeights | null>(null);
  const [savingWeights, setSavingWeights] = useState(false);

  const topCard = candidates[0] ?? null;

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMatchBanner(null);
    const params = new URLSearchParams();
    if (filterLookingFor) params.set("lookingFor", filterLookingFor);
    if (filterLocation) params.set("locationPreference", filterLocation);

    try {
      const response = await fetch(`/api/discover?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not load discover feed.");
        return;
      }
      const payload = (await response.json()) as DiscoverResponse;
      setCandidates(payload.candidates ?? []);
      setIncomingLikes(payload.incomingLikes ?? []);
      setEmptyReason(payload.emptyReason ?? null);
    } finally {
      setLoading(false);
    }
  }, [filterLookingFor, filterLocation]);

  useEffect(() => {
    void loadDiscover();
  }, [loadDiscover]);

  useEffect(() => {
    let cancelled = false;
    async function loadLearning() {
      const [insightRes, weightsRes] = await Promise.all([
        fetch("/api/matches/insights", { cache: "no-store" }),
        fetch("/api/matches/weights", { cache: "no-store" })
      ]);
      if (cancelled) return;

      if (insightRes.ok) {
        const payload = (await insightRes.json()) as MatchInsightsResponse;
        setInsights(payload.revealedPreferences ?? null);
      }
      if (weightsRes.ok) {
        const payload = (await weightsRes.json()) as { weights: MatchWeights };
        setWeights(payload.weights);
      }
    }
    void loadLearning();
    return () => {
      cancelled = true;
    };
  }, []);

  const stacked = useMemo(() => candidates.slice(0, 3), [candidates]);

  async function swipe(action: "like" | "pass", candidate = topCard) {
    if (!candidate) return;

    try {
      const result = await postSwipe(candidate.id, action);
      setCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
      setIncomingLikes((prev) => prev.filter((item) => item.id !== candidate.id));
      if (result.matched) {
        setMatchBanner(`You and ${result.candidateFirstName ?? candidate.firstName} matched.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save swipe.");
    }
  }

  async function saveWeights() {
    if (!weights || savingWeights) return;
    setSavingWeights(true);
    try {
      const response = await fetch("/api/matches/weights", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(weights)
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not save weight preferences.");
        return;
      }
    } finally {
      setSavingWeights(false);
    }
  }

  return (
    <>
      <section className="panel stack">
        <p className="eyebrow">Discover</p>
        <h1>Swipe with intention</h1>
        <p className="muted">See profiles, compare fit, and choose with clarity.</p>
      </section>

      <section className="panel stack">
        <h2>Filters</h2>
        <div className="actions">
          <label>
            Looking for
            <select value={filterLookingFor} onChange={(event) => setFilterLookingFor(event.target.value)}>
              <option value="">All</option>
              <option value="marriage_minded">Marriage-minded</option>
              <option value="serious_relationship">Serious relationship</option>
              <option value="exploring">Exploring</option>
            </select>
          </label>
          <label>
            Location
            <select value={filterLocation} onChange={(event) => setFilterLocation(event.target.value)}>
              <option value="">All</option>
              <option value="same_city">Same city</option>
              <option value="relocatable">Relocatable</option>
              <option value="remote_ok">Remote OK</option>
            </select>
          </label>
        </div>
      </section>

      {insights && insights.sampleSize >= 10 && insights.statedVsRevealed.length > 0 ? (
        <section className="panel stack">
          <h2>What we&apos;re learning about you</h2>
          {insights.statedVsRevealed.slice(0, 2).map((insight) => (
            <p key={insight.trait} className="muted small">
              You said <strong>{String(insight.statedPreference)}</strong> for {insight.trait.replaceAll("_", " ")},
              but your recent messages trend toward <strong>{String(insight.revealedPreference)}</strong>.
            </p>
          ))}
        </section>
      ) : null}

      {insights && insights.sampleSize >= 20 && weights ? (
        <section className="panel stack">
          <h2>Tune your matches</h2>
          <p className="muted small">Adjust what matters most in your recommendations.</p>

          <label>
            Emotional compatibility
            <input
              className="range-input"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={weights.attachment}
              onChange={(event) =>
                setWeights((prev) => (prev ? { ...prev, attachment: Number(event.target.value) } : prev))
              }
            />
          </label>
          <label>
            Conflict style match
            <input
              className="range-input"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={weights.conflict}
              onChange={(event) =>
                setWeights((prev) => (prev ? { ...prev, conflict: Number(event.target.value) } : prev))
              }
            />
          </label>
          <label>
            Relationship vision alignment
            <input
              className="range-input"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={weights.vision}
              onChange={(event) =>
                setWeights((prev) => (prev ? { ...prev, vision: Number(event.target.value) } : prev))
              }
            />
          </label>
          <label>
            Lifestyle compatibility
            <input
              className="range-input"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={weights.lifestyle}
              onChange={(event) =>
                setWeights((prev) => (prev ? { ...prev, lifestyle: Number(event.target.value) } : prev))
              }
            />
          </label>

          <div className="actions">
            <button type="button" onClick={() => void saveWeights()} disabled={savingWeights}>
              {savingWeights ? "Saving..." : "Save tuning"}
            </button>
          </div>
        </section>
      ) : null}

      {matchBanner ? <section className="panel panel-tight"><p className="inline-ok">{matchBanner}</p></section> : null}
      {error ? <section className="panel panel-tight"><p role="alert" className="inline-error">{error}</p></section> : null}

      {incomingLikes.length > 0 ? (
        <section className="panel stack">
          <h2>Liked your profile</h2>
          <p className="muted">Review and decide.</p>
          {incomingLikes.map((candidate) => (
            <article key={`incoming-${candidate.id}`} className="prompt-card">
              <strong>{candidate.firstName}</strong>
              <p className="muted">{candidate.compatibilityHighlight}</p>
              {candidate.understandingMatch ? (
                <details className="match-insight">
                  <summary>Understanding this match</summary>
                  <p className="muted small">Score: {candidate.understandingMatch.score}</p>
                  <p className="small"><strong>What will feel easy</strong></p>
                  {candidate.understandingMatch.whatWillFeelEasy.map((item) => (
                    <p key={item} className="small">✓ {item}</p>
                  ))}
                  {candidate.understandingMatch.whatWillTakeWork.length > 0 ? (
                    <>
                      <p className="small"><strong>What will take work</strong></p>
                      {candidate.understandingMatch.whatWillTakeWork.map((challenge) => (
                        <article key={challenge.issue} className="match-insight-challenge">
                          <p className="small"><strong>{challenge.issue}</strong></p>
                          <p className="muted small">{challenge.explanation}</p>
                          <p className="small">How to navigate this: "{challenge.script}"</p>
                        </article>
                      ))}
                    </>
                  ) : null}
                </details>
              ) : null}
              <div className="actions">
                <button type="button" className="ghost" onClick={() => void swipe("pass", candidate)}>Pass</button>
                <button type="button" onClick={() => void swipe("like", candidate)}>Like back</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="panel stack">
        <h2>Swipe stack</h2>
        {loading ? <p className="muted">Loading profiles...</p> : null}
        {!loading && !topCard ? <p className="muted">{emptyReason ?? "Invite a friend to test"}</p> : null}

        {topCard ? (
          <div className="swipe-stack" aria-label="Discover cards">
            {stacked
              .slice()
              .reverse()
              .map((candidate, index) => {
                const isTop = candidate.id === topCard.id;
                return (
                  <motion.article
                    key={candidate.id}
                    className="swipe-card"
                    style={{
                      zIndex: 3 - index,
                      transform: `translateY(${index * 10}px) scale(${1 - index * 0.02})`
                    }}
                    drag={isTop ? "x" : false}
                    dragConstraints={{ left: 0, right: 0 }}
                    onDragEnd={(_, info) => {
                      if (!isTop) return;
                      if (info.offset.x > 120) {
                        void swipe("like", candidate);
                      } else if (info.offset.x < -120) {
                        void swipe("pass", candidate);
                      }
                    }}
                  >
                    <div className="swipe-photo-wrap">
                      {candidate.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={candidate.photoUrl} alt={`${candidate.firstName} profile`} className="swipe-photo" />
                      ) : (
                        <div className="swipe-photo-fallback">No photo yet</div>
                      )}
                      {candidate.likedYou ? <span className="trust-chip swipe-badge">Liked you</span> : null}
                    </div>
                    <div className="stack">
                      <h3>{candidate.firstName}</h3>
                      <p className="muted">{candidate.ageRange.replace("_", "-")} · {candidate.locationPreference.replace("_", " ")}</p>
                      <p><strong>Highlight:</strong> {candidate.compatibilityHighlight}</p>
                      <p><strong>Watch for:</strong> {candidate.watchForInsight}</p>
                      {candidate.understandingMatch ? (
                        <details className="match-insight">
                          <summary>Understanding this match</summary>
                          <p className="muted small">Score: {candidate.understandingMatch.score}</p>
                          <p className="small"><strong>What will feel easy</strong></p>
                          {candidate.understandingMatch.whatWillFeelEasy.map((item) => (
                            <p key={item} className="small">✓ {item}</p>
                          ))}
                          {candidate.understandingMatch.whatWillTakeWork.length > 0 ? (
                            <>
                              <p className="small"><strong>What will take work</strong></p>
                              {candidate.understandingMatch.whatWillTakeWork.map((challenge) => (
                                <article key={challenge.issue} className="match-insight-challenge">
                                  <p className="small"><strong>{challenge.issue}</strong></p>
                                  <p className="muted small">{challenge.explanation}</p>
                                  <p className="small">How to navigate this: "{challenge.script}"</p>
                                </article>
                              ))}
                            </>
                          ) : null}
                        </details>
                      ) : null}
                    </div>
                  </motion.article>
                );
              })}
          </div>
        ) : null}

        {topCard ? (
          <div className="actions">
            <button type="button" className="ghost" onClick={() => void swipe("pass")}>Swipe left (Pass)</button>
            <button type="button" onClick={() => void swipe("like")}>Swipe right (Like)</button>
          </div>
        ) : null}
      </section>
    </>
  );
}
