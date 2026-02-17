"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type MatchItem = {
  id: string;
  counterpartId: string;
  counterpartFirstName: string;
  counterpartAgeRange: string | null;
  counterpartLocationPreference: string | null;
  photoUrl: string | null;
  createdAt: string;
  compatibility: {
    score: number;
    tier: "strong" | "good" | "possible" | "low";
    dimensionScores: {
      attachment: number;
      conflict: number;
      vision: number;
      expression: number;
      growth: number;
    };
    notes: string[];
    warnings: string[];
  } | null;
};

type MatchTier = NonNullable<MatchItem["compatibility"]>["tier"];

export function MatchesList() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMatches(background = false) {
    if (!background) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetch("/api/matches/list", { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not load matches.");
        return;
      }
      const payload = (await response.json()) as { matches: MatchItem[] };
      setMatches(payload.matches ?? []);
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadMatches();
    const intervalId = window.setInterval(() => {
      void loadMatches(true);
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, []);

  function tierLabel(tier: MatchTier) {
    switch (tier) {
      case "strong":
        return "Strong Match";
      case "good":
        return "Good Match";
      case "possible":
        return "Possible Match";
      case "low":
        return "Low Match";
      default:
        return "Match";
    }
  }

  return (
    <>
      <section className="panel stack">
        <p className="eyebrow">Matches</p>
        <h1>Your mutual matches</h1>
        <p className="muted">Mutual likes appear here.</p>
      </section>

      <section className="panel stack">
        <div className="actions">
          <button type="button" className="ghost" onClick={() => void loadMatches()}>Refresh</button>
        </div>

        {loading ? <p className="muted">Loading matches...</p> : null}
        {error ? <p role="alert" className="inline-error">{error}</p> : null}

        {!loading && !error && matches.length === 0 ? (
          <p className="muted">No matches yet. Keep swiping in Discover.</p>
        ) : null}

        <div className="stack">
          {matches.map((match) => (
            <article
              key={match.id}
              className="prompt-card match-card"
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/matches/${match.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(`/matches/${match.id}`);
                }
              }}
            >
              <div className="match-row">
                {match.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={match.photoUrl} alt={`${match.counterpartFirstName} profile`} className="match-avatar" />
                ) : (
                  <div className="match-avatar match-avatar-fallback">{match.counterpartFirstName[0] ?? "M"}</div>
                )}
                <div>
                  <h3>{match.counterpartFirstName}</h3>
                  {match.counterpartAgeRange || match.counterpartLocationPreference ? (
                    <p className="muted tiny">
                      {[match.counterpartAgeRange?.replace("_", "-"), match.counterpartLocationPreference?.replace("_", " ")].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                  <p className="muted tiny">Matched on {new Date(match.createdAt).toLocaleDateString()}</p>
                </div>
                {match.compatibility ? (
                  <div className="match-score-wrap">
                    <p className="match-score">{match.compatibility.score}</p>
                    <p className="match-score-label">Compatibility</p>
                  </div>
                ) : null}
              </div>

              {match.compatibility ? (
                <>
                  <div className="match-tier">{tierLabel(match.compatibility.tier)}</div>

                  {match.compatibility.notes.length > 0 ? (
                    <ul className="match-notes">
                      {match.compatibility.notes.slice(0, 2).map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}

                  {match.compatibility.warnings.length > 0 ? (
                    <div className="match-warnings">
                      {match.compatibility.warnings.map((warning) => (
                        <p key={warning} className="match-warning-text">
                          {warning}
                        </p>
                      ))}
                    </div>
                  ) : null}

                  <div className="match-dimensions">
                    <div className="match-dimension">
                      <div className="match-dimension-head">
                        <span>Attachment</span>
                        <strong>{Math.round((match.compatibility.dimensionScores.attachment / 30) * 100)}</strong>
                      </div>
                      <div className="match-dimension-track">
                        <div
                          className="match-dimension-fill"
                          style={{ width: `${Math.round((match.compatibility.dimensionScores.attachment / 30) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="match-dimension">
                      <div className="match-dimension-head">
                        <span>Conflict Style</span>
                        <strong>{Math.round((match.compatibility.dimensionScores.conflict / 25) * 100)}</strong>
                      </div>
                      <div className="match-dimension-track">
                        <div
                          className="match-dimension-fill"
                          style={{ width: `${Math.round((match.compatibility.dimensionScores.conflict / 25) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="match-dimension">
                      <div className="match-dimension-head">
                        <span>Relationship Vision</span>
                        <strong>{Math.round((match.compatibility.dimensionScores.vision / 25) * 100)}</strong>
                      </div>
                      <div className="match-dimension-track">
                        <div
                          className="match-dimension-fill"
                          style={{ width: `${Math.round((match.compatibility.dimensionScores.vision / 25) * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <p className="muted tiny">Compatibility profile unavailable.</p>
              )}

              <div className="actions">
                <button type="button" onClick={() => router.push(`/matches/${match.id}`)}>Open chat</button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
