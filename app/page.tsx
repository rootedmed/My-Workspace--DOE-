import { OnboardingFlow } from "@/components/OnboardingFlow";

export default function HomePage() {
  return (
    <main>
      <h1>Commitment Match MVP</h1>
      <p className="muted">
        This MVP is designed for commitment-oriented matching with an AI-guided 14-day decision
        track.
      </p>

      <section className="panel">
        <h2>Product principles</h2>
        <ul className="list">
          <li>Clarity over ambiguity in relationship goals</li>
          <li>14-day structured self-reflection before major decisions</li>
          <li>Traits are self-reflection inputs, not medical labels or diagnosis</li>
        </ul>
      </section>

      <OnboardingFlow />
    </main>
  );
}
