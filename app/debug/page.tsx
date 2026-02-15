"use client";

import { useEffect, useState } from "react";

type DebugPayload = {
  projectRef: string | null;
  runtime: string;
  nodeEnv: string;
  env: Record<string, boolean>;
};

export default function DebugPage() {
  const [data, setData] = useState<DebugPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const response = await fetch("/api/debug/supabase", { cache: "no-store" });
      if (!response.ok) {
        if (!cancelled) {
          setError("Could not load debug diagnostics.");
        }
        return;
      }

      const payload = (await response.json()) as DebugPayload;
      if (!cancelled) {
        setData(payload);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <section className="panel">
        <h1>Supabase Debug</h1>
        {error ? <p role="alert" className="inline-error">{error}</p> : null}
        {data ? (
          <>
            <p><strong>Project ref:</strong> {data.projectRef ?? "Unavailable"}</p>
            <p><strong>Runtime:</strong> {data.runtime}</p>
            <p><strong>Node env:</strong> {data.nodeEnv}</p>
            <pre>{JSON.stringify(data.env, null, 2)}</pre>
          </>
        ) : (
          <p className="muted">Loading...</p>
        )}
      </section>
    </main>
  );
}
