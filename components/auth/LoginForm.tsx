"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { trackUxEvent } from "@/lib/observability/uxClient";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackUxEvent("auth_login_viewed");
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    trackUxEvent("auth_login_submitted");

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      trackUxEvent("auth_login_failed", { has_server_message: Boolean(payload?.error) });
      setError(payload?.error ?? "Invalid credentials.");
      setLoading(false);
      return;
    }

    trackUxEvent("auth_login_succeeded");
    router.push("/app");
    router.refresh();
  }

  return (
    <section className="auth-layout">
      <article className="auth-hero panel">
        <p className="eyebrow">Welcome back</p>
        <h1>Find your person with more clarity and less noise.</h1>
        <p className="muted">
          Thoughtful matching for people done with shallow swipes and mixed signals.
        </p>
      </article>

      <article className="auth-card panel">
        <h2>Sign in</h2>
        <form onSubmit={onSubmit} className="stack">
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
        {error ? <p role="alert" className="inline-error">{error}</p> : null}
        <p className="muted">
          New here? <Link href="/register">Create account</Link>
        </p>
      </article>
    </section>
  );
}
