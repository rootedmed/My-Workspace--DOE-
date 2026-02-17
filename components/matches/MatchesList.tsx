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
};

export function MatchesList() {
  const router = useRouter();
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadMatches() {
    setLoading(true);
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
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMatches();
  }, []);

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
            <article key={match.id} className="prompt-card">
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
              </div>
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
