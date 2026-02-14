import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>Commitment Match</h1>
      <p className="muted">
        A calm, commitment-oriented platform for long-term partnership decisions.
      </p>

      <section className="panel">
        <h2>How It Works</h2>
        <ul className="list">
          <li>Intent-first onboarding with transparent compatibility signals</li>
          <li>No diagnosis language, only non-clinical tendencies and fit insights</li>
          <li>14-day decision track designed for clarity and respectful closure</li>
        </ul>
      </section>

      <section className="panel actions">
        <Link className="button-link" href="/register">
          Create account
        </Link>
        <Link className="button-link" href="/login">
          Sign in
        </Link>
      </section>
    </main>
  );
}
