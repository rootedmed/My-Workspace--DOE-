import Link from "next/link";
import { isUiRouteEnabled } from "@/lib/config/uiFlags";
import { UiFallbackNotice } from "@/components/ui/UiFallbackNotice";

export default function HomePage() {
  if (!isUiRouteEnabled("public_auth")) {
    return (
      <main className="public-main">
        <UiFallbackNotice
          title="Home refresh is temporarily paused"
          description="The redesigned public experience is currently gated for rollout."
          primaryHref="/login"
          primaryLabel="Sign in"
          secondaryHref="/register"
          secondaryLabel="Create account"
        />
      </main>
    );
  }

  return (
    <main className="public-main">
      <section className="landing-hero panel">
        <p className="eyebrow">Commitment Match</p>
        <h1>Dating with clarity, not chaos.</h1>
        <p className="muted">
          A relationship-first experience for people who want depth, intention, and momentum.
        </p>
        <div className="actions">
          <Link className="button-link" href="/register">
            Create account
          </Link>
          <Link className="button-link ghost" href="/login">
            Sign in
          </Link>
        </div>
      </section>

      <section className="landing-grid">
        <article className="panel">
          <h2>Why it feels different</h2>
          <p className="muted">
            You get thoughtful compatibility guidance, not random noise or endless swiping loops.
          </p>
        </article>
        <article className="panel">
          <h2>Built for real relationships</h2>
          <p className="muted">
            We prioritize long-term alignment, communication rhythm, and emotional fit from day one.
          </p>
        </article>
        <article className="panel">
          <h2>Transparent by design</h2>
          <p className="muted">
            You’ll see why a match works, what needs care, and how to navigate differences early.
          </p>
        </article>
      </section>
    </main>
  );
}
