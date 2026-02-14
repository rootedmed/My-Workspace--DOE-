"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { withCsrfHeaders } from "@/components/auth/csrf";

export function RegisterForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ firstName, email, password })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Unable to create account.");
      setLoading(false);
      return;
    }

    router.push("/login");
    router.refresh();
  }

  return (
    <section className="panel step-card">
      <h1>Create account</h1>
      <p className="muted">Your profile stores derived relationship signals, not diagnosis labels.</p>
      <form onSubmit={onSubmit}>
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
      {error ? <p role="alert">{error}</p> : null}
      <p className="muted">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </section>
  );
}
