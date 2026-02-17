"use client";

import { useRouter } from "next/navigation";

type TabKey = "home" | "discover" | "matches" | "me";

export function BottomTabs({ current }: { current?: TabKey }) {
  const router = useRouter();

  return (
    <nav className="bottom-nav" aria-label="Main">
      <button type="button" className={current === "home" ? "nav-item active" : "nav-item"} onClick={() => router.push("/app")}>
        <span className="nav-dot" aria-hidden="true" />
        <span>Home</span>
      </button>
      <button type="button" className={current === "discover" ? "nav-item active" : "nav-item"} onClick={() => router.push("/discover")}>
        <span className="nav-dot" aria-hidden="true" />
        <span>Discover</span>
      </button>
      <button type="button" className={current === "matches" ? "nav-item active" : "nav-item"} onClick={() => router.push("/matches")}>
        <span className="nav-dot" aria-hidden="true" />
        <span>Matches</span>
      </button>
      <button type="button" className={current === "me" ? "nav-item active" : "nav-item"} onClick={() => router.push("/me")}>
        <span className="nav-dot" aria-hidden="true" />
        <span>Me</span>
      </button>
    </nav>
  );
}
