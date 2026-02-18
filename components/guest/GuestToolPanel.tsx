"use client";

import { useMemo, useState } from "react";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { trackUxEvent } from "@/lib/observability/uxClient";

type SessionPayload = {
  token: string;
  expiresAt: string;
  path: string;
};

export function GuestToolPanel() {
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(() => {
    if (!session || typeof window === "undefined") return "";
    return `${window.location.origin}${session.path}`;
  }, [session]);

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
        trackUxEvent("guest_link_create_failed", { has_server_message: Boolean(payload?.error) });
        setError(payload?.error ?? "Could not create guest link.");
        return;
      }
      const payload = (await response.json()) as SessionPayload;
      setSession(payload);
      trackUxEvent("guest_link_created");
    } finally {
      setLoading(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      trackUxEvent("guest_link_copied");
      window.setTimeout(() => setCopied(false), 1300);
    } catch {
      trackUxEvent("guest_link_copy_failed");
      setError("Could not copy link. Please copy it manually.");
    }
  }

  async function shareLink() {
    if (!shareUrl || sharing) return;
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
      return;
    }

    setSharing(true);
    setError(null);
    try {
      await navigator.share({
        title: "Guest compatibility link",
        text: "Answer these prompts so we can see if we're compatible.",
        url: shareUrl
      });
      trackUxEvent("guest_link_shared_native");
    } catch {
      // User-cancelled share should be quiet.
    } finally {
      setSharing(false);
    }
  }

  return (
    <>
      <section className="panel stack guest-tool-panel">
        <h2>Create a guest compatibility link</h2>
        <p className="muted">
          Share one private link with someone off-app. They answer the same profile prompts and you get a compatibility snapshot.
        </p>

        <div className="actions">
          <button type="button" onClick={() => void createLink()} disabled={loading}>
            {loading ? "Creating..." : session ? "Create a new link" : "Create guest link"}
          </button>
        </div>

        {error ? <p role="alert" className="inline-error">{error}</p> : null}

        {session ? (
          <article className="prompt-card guest-link-card">
            <p className="small"><strong>Share this link</strong></p>
            <p className="guest-link-url">{shareUrl}</p>
            <p className="muted tiny">Expires {new Date(session.expiresAt).toLocaleString()}</p>
            <div className="actions">
              <button type="button" className="ghost" onClick={() => void copyLink()}>
                {copied ? "Copied" : "Copy link"}
              </button>
              {typeof navigator !== "undefined" && typeof navigator.share === "function" ? (
                <button type="button" className="ghost" onClick={() => void shareLink()} disabled={sharing}>
                  {sharing ? "Sharing..." : "Share"}
                </button>
              ) : null}
            </div>
          </article>
        ) : (
          <article className="prompt-card">
            <p className="small">No active link yet. Create one to start collecting guest compatibility responses.</p>
          </article>
        )}
      </section>

      <section className="panel panel-tight">
        <p className="tiny muted">
          Guest links are private tokens, expire automatically, and are capped monthly to prevent spam.
        </p>
      </section>
    </>
  );
}
