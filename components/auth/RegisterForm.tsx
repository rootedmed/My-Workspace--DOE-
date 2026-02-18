"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { trackUxEvent } from "@/lib/observability/uxClient";

export function RegisterForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    trackUxEvent("auth_register_viewed");
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    trackUxEvent("auth_register_submitted");

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ firstName, email, password })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      trackUxEvent("auth_register_failed", { has_server_message: Boolean(payload?.error) });
      setError(payload?.error ?? "Unable to create account.");
      setLoading(false);
      return;
    }

    trackUxEvent("auth_register_succeeded");
    router.push("/login");
    router.refresh();
  }

  return (
    <section className="auth-layout">
      <article className="auth-hero panel">
        <p className="eyebrow">Start fresh</p>
        <h1>Dating that respects your time, energy, and standards.</h1>
        <p className="muted">
          Build your profile once, get meaningful matches, and move with confidence.
        </p>
      </article>

      <article className="auth-card panel">
        <h2>Create account</h2>
        <form onSubmit={onSubmit} className="stack">
          <label>
            First name
            <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
          </label>
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Password
            <input
              type="password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {password.length > 0 && password.length < 8 ? (
            <p className="inline-error">Password must be at least 8 characters.</p>
          ) : null}
          <button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>
        {error ? <p role="alert" className="inline-error">{error}</p> : null}
        <p className="muted">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      </article>
    </section>
  );
}
