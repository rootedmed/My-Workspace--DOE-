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

export function MatchChat({ matchId, currentUserId }: { matchId: string; currentUserId: string }) {
  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
