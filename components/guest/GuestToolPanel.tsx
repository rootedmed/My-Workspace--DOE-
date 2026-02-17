"use client";

import { useState } from "react";
import { withCsrfHeaders } from "@/components/auth/csrf";

type SessionPayload = {
  token: string;
  expiresAt: string;
  path: string;
};

export function GuestToolPanel() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [copied, setCopied] = useState(false);

  async function createLink() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      const response = await fetch("/api/guest/create", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({})
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not create guest link.");
        return;
      }
      const payload = (await response.json()) as SessionPayload;
      setSession(payload);
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!session) return;
    const url = `${window.location.origin}${session.path}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <section className="panel stack">
      <div className="actions">
        <button type="button" onClick={() => void createLink()} disabled={loading}>
          {loading ? "Creating..." : "Create Guest Link"}
        </button>
      </div>
      {error ? <p role="alert" className="inline-error">{error}</p> : null}

      {session ? (
        <div className="prompt-card">
          <p className="small"><strong>Guest link</strong></p>
          <p className="muted tiny">{`${window.location.origin}${session.path}`}</p>
          <p className="muted tiny">Expires: {new Date(session.expiresAt).toLocaleString()}</p>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => void copyLink()}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
