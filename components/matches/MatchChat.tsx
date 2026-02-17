"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { withCsrfHeaders } from "@/components/auth/csrf";

type MatchSummary = {
  id: string;
  counterpartId: string;
  counterpartFirstName: string;
  counterpartPhotoUrl: string | null;
  createdAt: string;
};

type ChatMessage = {
  id: string;
  matchId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

type ThreadResponse = {
  match: MatchSummary;
  messages: ChatMessage[];
};

type CheckInResponse = {
  enabled: boolean;
  myOptIn: boolean;
  checkIn: {
    monthNumber: number;
    yourResponses: { connection: number; conflictHandling: number; growth: number } | null;
    partnerResponses: { connection: number; conflictHandling: number; growth: number } | null;
    coachingScript: string | null;
  } | null;
};

export function MatchChat({ matchId, currentUserId }: { matchId: string; currentUserId: string }) {
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<CheckInResponse | null>(null);
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [checkInAnswers, setCheckInAnswers] = useState({
    connection: 3,
    conflictHandling: 3,
    growth: 3
  });
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  const loadThread = useCallback(async () => {
    try {
      const response = await fetch(`/api/matches/${matchId}/messages`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not load chat.");
        return;
      }
      const payload = (await response.json()) as ThreadResponse;
      setThread(payload);
      setError(null);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void loadThread();
    const intervalId = window.setInterval(() => {
      void loadThread();
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [loadThread]);

  useEffect(() => {
    let cancelled = false;
    async function loadCheckIn() {
      const response = await fetch(`/api/matches/${matchId}/check-ins`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as CheckInResponse;
      if (!cancelled) {
        setCheckIn(payload);
      }
    }
    void loadCheckIn();
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const canSend = useMemo(() => draft.trim().length > 0 && !sending, [draft, sending]);

  async function sendMessage() {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    try {
      const response = await fetch(`/api/matches/${matchId}/messages`, {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ body })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not send message.");
        return;
      }

      setDraft("");
      await loadThread();
    } finally {
      setSending(false);
    }
  }

  async function setOptIn(optIn: boolean) {
    const response = await fetch(`/api/matches/${matchId}/check-ins/opt-in`, {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ optIn })
    });
    if (!response.ok) {
      return;
    }
    const refresh = await fetch(`/api/matches/${matchId}/check-ins`, { cache: "no-store" });
    if (refresh.ok) {
      setCheckIn((await refresh.json()) as CheckInResponse);
    }
  }

  async function submitCheckIn() {
    if (checkInSubmitting) return;
    setCheckInSubmitting(true);
    try {
      const response = await fetch(`/api/matches/${matchId}/check-ins`, {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ responses: checkInAnswers })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not submit check-in.");
        return;
      }
      const refresh = await fetch(`/api/matches/${matchId}/check-ins`, { cache: "no-store" });
      if (refresh.ok) {
        setCheckIn((await refresh.json()) as CheckInResponse);
      }
    } finally {
      setCheckInSubmitting(false);
    }
  }

  async function createSnapshot() {
    const response = await fetch("/api/snapshot/create", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ matchId })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not create snapshot.");
      return;
    }
    const payload = (await response.json()) as { path: string };
    setSnapshotUrl(`${window.location.origin}${payload.path}`);
  }

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="match-row">
          {thread?.match.counterpartPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thread.match.counterpartPhotoUrl} alt={`${thread.match.counterpartFirstName} profile`} className="match-avatar" />
          ) : (
            <div className="match-avatar match-avatar-fallback">
              {thread?.match.counterpartFirstName?.[0] ?? "M"}
            </div>
          )}
          <div className="stack">
            <p className="eyebrow">Chat</p>
            <h1>{thread?.match.counterpartFirstName ?? "Match"}</h1>
          </div>
        </div>
        <div className="actions">
          <Link href="/matches" className="button-link ghost">Back to Matches</Link>
        </div>
      </section>

      <section className="panel stack">
        {loading ? <p className="muted">Loading messages...</p> : null}
        {error ? <p role="alert" className="inline-error">{error}</p> : null}
        {!loading && !error && (thread?.messages.length ?? 0) === 0 ? (
          <p className="muted">No messages yet. Say hi.</p>
        ) : null}

        <div className="chat-list" aria-live="polite">
          {(thread?.messages ?? []).map((message) => {
            const mine = message.senderId === currentUserId;
            return (
              <article key={message.id} className={mine ? "chat-bubble mine" : "chat-bubble theirs"}>
                <p>{message.body}</p>
                <p className="tiny muted">{new Date(message.createdAt).toLocaleString()}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel stack">
        <label htmlFor="chat-message">Message</label>
        <textarea
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={2000}
          placeholder="Write a message..."
          rows={3}
        />
        <div className="actions">
          <button type="button" onClick={() => void sendMessage()} disabled={!canSend}>
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </section>

      <section className="panel stack">
        <h2>Relationship check-ins</h2>
        <p className="muted small">
          Monthly 3-question check-ins help you catch drift early. Both of you need to opt in.
        </p>
        {!checkIn?.myOptIn ? (
          <div className="actions">
            <button type="button" onClick={() => void setOptIn(true)}>Opt in to check-ins</button>
          </div>
        ) : (
          <p className="inline-ok">You opted in.</p>
        )}
        {!checkIn?.enabled ? <p className="muted tiny">Waiting for your match to opt in.</p> : null}

        {checkIn?.enabled ? (
          <>
            <label>
              Connection
              <input
                className="range-input"
                type="range"
                min={1}
                max={5}
                step={1}
                value={checkInAnswers.connection}
                onChange={(event) =>
                  setCheckInAnswers((prev) => ({ ...prev, connection: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              Conflict handling
              <input
                className="range-input"
                type="range"
                min={1}
                max={5}
                step={1}
                value={checkInAnswers.conflictHandling}
                onChange={(event) =>
                  setCheckInAnswers((prev) => ({ ...prev, conflictHandling: Number(event.target.value) }))
                }
              />
            </label>
            <label>
              Growth direction
              <input
                className="range-input"
                type="range"
                min={1}
                max={5}
                step={1}
                value={checkInAnswers.growth}
                onChange={(event) =>
                  setCheckInAnswers((prev) => ({ ...prev, growth: Number(event.target.value) }))
                }
              />
            </label>
            <div className="actions">
              <button type="button" onClick={() => void submitCheckIn()} disabled={checkInSubmitting}>
                {checkInSubmitting ? "Submitting..." : "Submit monthly check-in"}
              </button>
            </div>
          </>
        ) : null}

        {checkIn?.checkIn?.coachingScript ? (
          <article className="prompt-card">
            <p className="small"><strong>Suggested check-in script</strong></p>
            <p className="muted small">{checkIn.checkIn.coachingScript}</p>
          </article>
        ) : null}
      </section>

      <section className="panel stack">
        <h2>Get advice on this match</h2>
        <p className="muted small">
          Create a redacted compatibility snapshot you can share for feedback.
        </p>
        <div className="actions">
          <button type="button" onClick={() => void createSnapshot()}>Create advice snapshot</button>
        </div>
        {snapshotUrl ? <p className="muted tiny">{snapshotUrl}</p> : null}
      </section>
    </div>
  );
}
