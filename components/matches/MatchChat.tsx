"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { trackUxEvent } from "@/lib/observability/uxClient";

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
  uiSummary?: {
    profileHighlights: string[];
    compatibilitySnapshot: { score: number; tier: string; warnings: string[] } | null;
  };
};

type ProfileResponse = {
  match: MatchSummary;
  compatibilitySnapshot: {
    score: number;
    tier: string;
    notes: string[];
    warnings: string[];
    dimensionScores: {
      attachment: number;
      conflict: number;
      vision: number;
      expression: number;
      growth: number;
    };
  } | null;
  coaching: {
    whatWillFeelEasy: string[];
    whatWillTakeWork: Array<{ issue: string; explanation: string; script: string }>;
  } | null;
  checkIn: {
    enabled: boolean;
    myOptIn: boolean;
    latestMonth: number | null;
    yourResponses: { connection: number; conflictHandling: number; growth: number } | null;
    partnerResponses: { connection: number; conflictHandling: number; growth: number } | null;
  };
};

type MatchDetailTab = "profile" | "chat";

export function MatchChat({
  matchId,
  currentUserId,
  initialTab = "profile"
}: {
  matchId: string;
  currentUserId: string;
  initialTab?: MatchDetailTab;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<MatchDetailTab>(initialTab);

  const [thread, setThread] = useState<ThreadResponse | null>(null);
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [checkInSubmitting, setCheckInSubmitting] = useState(false);
  const [checkInAnswers, setCheckInAnswers] = useState({
    connection: 3,
    conflictHandling: 3,
    growth: 3
  });
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  const loadThread = useCallback(async () => {
    const response = await fetch(`/api/matches/${matchId}/messages`, { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not load chat.");
    }
    setThread((await response.json()) as ThreadResponse);
  }, [matchId]);

  const loadProfile = useCallback(async () => {
    const response = await fetch(`/api/matches/${matchId}/profile`, { cache: "no-store" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? "Could not load match profile.");
    }
    setProfile((await response.json()) as ProfileResponse);
  }, [matchId]);

  useEffect(() => {
    trackUxEvent("matches_detail_viewed", { initial_tab: initialTab });
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      setError(null);
      try {
        await Promise.all([loadThread(), loadProfile()]);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load match.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [loadProfile, loadThread]);

  useEffect(() => {
    if (tab !== "chat") return;
    const intervalId = window.setInterval(() => {
      void loadThread().catch(() => undefined);
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, [loadThread, tab]);

  const canSend = useMemo(() => draft.trim().length > 0 && !sending, [draft, sending]);
  const match = profile?.match ?? thread?.match ?? null;

  function switchTab(next: MatchDetailTab) {
    setTab(next);
    trackUxEvent("matches_detail_tab_switched", { tab: next });
    router.replace(`${pathname}?tab=${next}`);
  }

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
        trackUxEvent("matches_chat_send_failed", { has_server_message: Boolean(payload?.error) });
        setError(payload?.error ?? "Could not send message.");
        return;
      }

      setDraft("");
      await loadThread();
      trackUxEvent("matches_chat_sent");
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
    if (!response.ok) return;
    trackUxEvent("matches_checkin_optin_updated", { opted_in: optIn });
    await loadProfile().catch(() => undefined);
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
        trackUxEvent("matches_checkin_submit_failed", { has_server_message: Boolean(payload?.error) });
        setError(payload?.error ?? "Could not submit check-in.");
        return;
      }
      await loadProfile().catch(() => undefined);
      trackUxEvent("matches_checkin_submitted");
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
      trackUxEvent("matches_snapshot_create_failed", { has_server_message: Boolean(payload?.error) });
      setError(payload?.error ?? "Could not create snapshot.");
      return;
    }
    const payload = (await response.json()) as { path: string };
    setSnapshotUrl(`${window.location.origin}${payload.path}`);
    trackUxEvent("matches_snapshot_created");
  }

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="match-detail-header">
          <Link href="/matches" className="match-back-link">
            <span aria-hidden="true">‹</span> Matches
          </Link>
          <h1>{match?.counterpartFirstName ?? "Match"}</h1>
          <button type="button" className="ghost match-overflow-button" aria-label="More actions">
            •••
          </button>
        </div>

        <div className="match-row">
          {match?.counterpartPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={match.counterpartPhotoUrl} alt={`${match.counterpartFirstName} profile`} className="match-avatar" />
          ) : (
            <div className="match-avatar match-avatar-fallback">{match?.counterpartFirstName?.[0] ?? "M"}</div>
          )}
          <p className="muted tiny">Matched {new Date(match?.createdAt ?? Date.now()).toLocaleDateString()}</p>
        </div>

        <div className="actions match-tabs" role="tablist" aria-label="Match details tabs">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "profile"}
            aria-controls="match-profile-tab"
            id="match-profile-tab-button"
            className={tab === "profile" ? "tab-chip active" : "tab-chip"}
            onClick={() => switchTab("profile")}
          >
            Profile
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "chat"}
            aria-controls="match-chat-tab"
            id="match-chat-tab-button"
            className={tab === "chat" ? "tab-chip active" : "tab-chip"}
            onClick={() => switchTab("chat")}
          >
            Chat
          </button>
        </div>
      </section>

      {loading ? <section className="panel"><p className="muted">Loading match...</p></section> : null}
      {error ? <section className="panel"><p role="alert" className="inline-error">{error}</p></section> : null}

      {!loading && tab === "profile" ? (
        <>
          <section className="panel stack" id="match-profile-tab" role="tabpanel" aria-labelledby="match-profile-tab-button">
            <h2>Compatibility snapshot</h2>
            {profile?.compatibilitySnapshot ? (
              <>
                <p className="small"><strong>Score:</strong> {profile.compatibilitySnapshot.score} · {profile.compatibilitySnapshot.tier}</p>
                {profile.compatibilitySnapshot.notes.slice(0, 3).map((note) => (
                  <p key={note} className="small">✓ {note}</p>
                ))}
                {profile.compatibilitySnapshot.warnings.slice(0, 2).map((warning) => (
                  <p key={warning} className="small">⚠ {warning}</p>
                ))}
              </>
            ) : (
              <p className="muted">Compatibility details will appear after profile sync.</p>
            )}
          </section>

          {profile?.coaching ? (
            <section className="panel stack">
              <h2>Understanding this match</h2>
              {profile.coaching.whatWillFeelEasy.map((item) => (
                <p key={item} className="small">✓ {item}</p>
              ))}
              {profile.coaching.whatWillTakeWork.map((item) => (
                <article key={item.issue} className="prompt-card">
                  <p className="small"><strong>{item.issue}</strong></p>
                  <p className="muted small">{item.explanation}</p>
                  <p className="small">How to navigate this: &quot;{item.script}&quot;</p>
                </article>
              ))}
            </section>
          ) : null}

          <section className="panel stack" id="match-profile-checkins-tab" role="region" aria-label="Relationship check-ins">
            <h2>Relationship check-ins</h2>
            {!profile?.checkIn.myOptIn ? (
              <div className="actions">
                <button type="button" onClick={() => void setOptIn(true)}>Opt in to check-ins</button>
              </div>
            ) : (
              <p className="inline-ok">You opted in for monthly check-ins.</p>
            )}
            {!profile?.checkIn.enabled ? <p className="muted tiny">Waiting for your match to opt in.</p> : null}

            {profile?.checkIn.enabled ? (
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
                    {checkInSubmitting ? "Submitting..." : "Submit check-in"}
                  </button>
                </div>
              </>
            ) : null}
          </section>

          <section className="panel stack" id="match-profile-snapshot-tab" role="region" aria-label="Advice snapshot">
            <h2>Get advice</h2>
            <p className="muted small">Create a redacted compatibility snapshot and share it with a trusted friend.</p>
            <div className="actions">
              <button type="button" onClick={() => void createSnapshot()}>Create advice snapshot</button>
            </div>
            {snapshotUrl ? <p className="muted tiny">{snapshotUrl}</p> : null}
          </section>
        </>
      ) : null}

      {!loading && tab === "chat" ? (
        <>
          <section className="panel stack" id="match-chat-tab" role="tabpanel" aria-labelledby="match-chat-tab-button">
            {(thread?.uiSummary?.compatibilitySnapshot?.score ?? null) !== null ? (
              <p className="muted tiny">
                Compatibility score: {thread?.uiSummary?.compatibilitySnapshot?.score} · {thread?.uiSummary?.compatibilitySnapshot?.tier}
              </p>
            ) : null}
            {thread?.messages.length === 0 ? <p className="muted">No messages yet. Say hi.</p> : null}

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
        </>
      ) : null}
    </div>
  );
}
