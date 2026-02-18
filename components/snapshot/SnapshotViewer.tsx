"use client";

import { useEffect, useState } from "react";
import { trackUxEvent } from "@/lib/observability/uxClient";

type SnapshotPayload = {
  snapshot: {
    score: number;
    tier: string;
    dimensionScores: {
      attachment: number;
      conflict: number;
      vision: number;
      expression: number;
      growth: number;
    };
    notes: string[];
    warnings: string[];
  };
  expiresAt: string;
  views: number;
};

export function SnapshotViewer({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<SnapshotPayload | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const response = await fetch(`/api/snapshot/${token}`, { cache: "no-store" });
      if (!response.ok) {
        if (!cancelled) {
          setError("Snapshot not found or expired.");
          setLoading(false);
        }
        return;
      }

      const data = (await response.json()) as SnapshotPayload;
      if (cancelled) return;
      setPayload(data);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!payload) return;
    trackUxEvent("snapshot_viewed", {
      score: payload.snapshot.score,
      views: payload.views
    });
  }, [payload]);

  if (loading) {
    return (
      <section className="panel">
        <p className="muted">Loading snapshot...</p>
      </section>
    );
  }

  if (error || !payload) {
    return (
      <section className="panel stack">
        <p className="eyebrow">Compatibility Snapshot</p>
        <h1>Link unavailable</h1>
        <p role="alert" className="inline-error">{error ?? "Could not load snapshot."}</p>
      </section>
    );
  }

  const rows = [
    ["Attachment rhythm", payload.snapshot.dimensionScores.attachment],
    ["Conflict navigation", payload.snapshot.dimensionScores.conflict],
    ["Relationship vision", payload.snapshot.dimensionScores.vision],
    ["Love expression", payload.snapshot.dimensionScores.expression],
    ["Growth alignment", payload.snapshot.dimensionScores.growth]
  ] as const;

  return (
    <>
      <section className="panel stack snapshot-hero">
        <p className="eyebrow">Shared Compatibility Snapshot</p>
        <div className="snapshot-score-row">
          <h1>{payload.snapshot.score}</h1>
          <span className="trust-chip">{payload.snapshot.tier}</span>
        </div>
        <p className="muted">
          A lightweight view of compatibility strengths and friction points for advice from trusted friends.
        </p>
      </section>

      <section className="panel stack">
        <h2>Dimension breakdown</h2>
        <div className="snapshot-meter-list">
          {rows.map(([label, value]) => {
            const clamped = Math.max(4, Math.min(100, Number(value) || 0));
            return (
              <article key={label} className="snapshot-meter">
                <div className="snapshot-meter-label">
                  <p className="small"><strong>{label}</strong></p>
                  <p className="tiny muted">{Math.round(clamped)}</p>
                </div>
                <div className="snapshot-meter-track">
                  <span className="snapshot-meter-fill" style={{ width: `${clamped}%` }} />
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel stack">
        <h2>What will feel easy</h2>
        {(payload.snapshot.notes ?? []).length > 0 ? (
          (payload.snapshot.notes ?? []).map((note) => (
            <p key={note} className="small">✓ {note}</p>
          ))
        ) : (
          <p className="muted small">No easy-pattern notes are available for this snapshot.</p>
        )}

        <h2>What will take work</h2>
        {(payload.snapshot.warnings ?? []).length > 0 ? (
          (payload.snapshot.warnings ?? []).map((warning) => (
            <p key={warning} className="small">⚠ {warning}</p>
          ))
        ) : (
          <p className="muted small">No major friction warnings were surfaced.</p>
        )}

        <p className="tiny muted">
          Expires {new Date(payload.expiresAt).toLocaleString()} · Views {payload.views}
        </p>
      </section>
    </>
  );
}
