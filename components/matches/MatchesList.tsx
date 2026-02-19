"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trackUxEvent } from "@/lib/observability/uxClient";

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
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

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
      const payload = (await response.json()) as {
        matches: MatchItem[];
        profileIncomplete?: boolean;
        missingFields?: string[];
      };
      setMatches(payload.matches ?? []);
      setProfileIncomplete(Boolean(payload.profileIncomplete));
      setMissingFields(payload.missingFields ?? []);
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

  return (
    <>
      <section className="panel stack">
        <p className="eyebrow">Matches</p>
        <h1>Matches</h1>
        <p className="muted">Conversations start here.</p>
      </section>

      <section className="panel stack">
        {profileIncomplete ? (
          <article className="prompt-card">
            <p className="small">
              Finish your profile setup to unlock matches: {missingFields.join(", ").replaceAll("_", " ")}.
            </p>
            <div className="actions">
              <Link href="/profile/setup" className="button-link">Open profile setup</Link>
            </div>
          </article>
        ) : null}

        <div className="actions">
          <button type="button" className="ghost" onClick={() => void loadMatches()}>Refresh</button>
        </div>

        {loading ? <p className="muted">Loading matches...</p> : null}
        {error ? <p role="alert" className="inline-error">{error}</p> : null}

        {!loading && !error && matches.length === 0 ? (
          <p className="muted">No matches yet. Head to Discover and keep it intentional.</p>
        ) : null}

        <div className="stack">
          {matches.map((match) => (
            <article
              key={match.id}
              className="prompt-card match-card"
              role="button"
              tabIndex={0}
              onClick={() => {
                trackUxEvent("matches_card_opened");
                router.push(`/matches/${match.id}`);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  trackUxEvent("matches_card_opened");
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
                  <p className="muted tiny">Matched {new Date(match.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
