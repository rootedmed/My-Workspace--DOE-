"use client";

import { useEffect, useState } from "react";

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

  if (loading) {
    return <section className="panel"><p className="muted">Loading snapshot...</p></section>;
  }
  if (error || !payload) {
    return <section className="panel"><p role="alert" className="inline-error">{error ?? "Could not load snapshot."}</p></section>;
  }

  const rows = [
    ["Attachment", payload.snapshot.dimensionScores.attachment],
    ["Conflict", payload.snapshot.dimensionScores.conflict],
    ["Vision", payload.snapshot.dimensionScores.vision]
  ] as const;

  return (
    <>
      <section className="panel stack">
        <p className="eyebrow">Compatibility Snapshot</p>
        <h1>Score: {payload.snapshot.score}</h1>
        <p className="muted tiny">Tier: {payload.snapshot.tier}</p>
      </section>
      <section className="panel stack">
        {rows.map(([label, value]) => (
          <div key={label} className="stack">
            <p className="small"><strong>{label}</strong> ({Math.round(value)})</p>
            <div style={{ width: "100%", height: 8, borderRadius: 999, background: "var(--surface-alt)" }}>
              <div
                style={{
                  width: `${Math.max(4, Math.min(100, value))}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: "linear-gradient(90deg, var(--accent), var(--accent-strong))"
                }}
              />
            </div>
          </div>
        ))}
      </section>
      <section className="panel stack">
        <h2>What will feel easy</h2>
        {(payload.snapshot.notes ?? []).map((note) => (
          <p key={note} className="small">✓ {note}</p>
        ))}
        <h2>What will take work</h2>
        {(payload.snapshot.warnings ?? []).map((warning) => (
          <p key={warning} className="small">⚠ {warning}</p>
        ))}
        <p className="muted tiny">
          Expires {new Date(payload.expiresAt).toLocaleString()} · Views {payload.views}
        </p>
      </section>
    </>
  );
}
