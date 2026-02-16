"use client";

import { useEffect, useState } from "react";

type DebugPayload = {
  projectRef: string | null;
  healthReachable: boolean | null;
  effectiveAnonKeyProjectRef: string | null;
  effectiveAnonKeyLooksValid: boolean;
  effectiveAnonKeyMatchesUrl: boolean | null;
  serverAnonKeyProjectRef: string | null;
  serverAnonKeyLooksValid: boolean;
  serverAnonKeyMatchesUrl: boolean | null;
  publicAnonKeyProjectRef: string | null;
  publicAnonKeyLooksValid: boolean;
  publicAnonKeyMatchesUrl: boolean | null;
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
            <p><strong>Supabase host reachable:</strong> {String(data.healthReachable)}</p>
            <p><strong>Effective anon key ref:</strong> {data.effectiveAnonKeyProjectRef ?? "Unavailable"}</p>
            <p><strong>Effective anon valid:</strong> {String(data.effectiveAnonKeyLooksValid)}</p>
            <p><strong>Effective anon matches URL ref:</strong> {String(data.effectiveAnonKeyMatchesUrl)}</p>
            <p><strong>Server anon key ref:</strong> {data.serverAnonKeyProjectRef ?? "Unavailable"}</p>
            <p><strong>Server anon valid:</strong> {String(data.serverAnonKeyLooksValid)}</p>
            <p><strong>Server anon matches URL ref:</strong> {String(data.serverAnonKeyMatchesUrl)}</p>
            <p><strong>Public anon key ref:</strong> {data.publicAnonKeyProjectRef ?? "Unavailable"}</p>
            <p><strong>Public anon valid:</strong> {String(data.publicAnonKeyLooksValid)}</p>
            <p><strong>Public anon matches URL ref:</strong> {String(data.publicAnonKeyMatchesUrl)}</p>
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
