"use client";

import { useCallback, useEffect, useState } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import Link from "next/link";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { trackUxEvent } from "@/lib/observability/uxClient";

type Candidate = {
  id: string;
  firstName: string;
  ageRange: string;
  locationPreference: string;
  photoUrl: string | null;
  compatibilityHighlight: string;
  watchForInsight: string;
  likedYou: boolean;
  understandingMatch: {
    matchName: string;
    score: number;
    whatWillFeelEasy: string[];
    whatWillTakeWork: Array<{
      issue: string;
      explanation: string;
      script: string;
    }>;
  } | null;
  displayMeta: {
    primaryLabel: string;
    secondaryLabel: string;
    tagline: string;
  };
};

type DiscoverResponse = {
  candidates: Candidate[];
  incomingLikes: Candidate[];
  emptyReason?: string | null;
  profileIncomplete?: boolean;
  missingFields?: string[];
  photoQualityFlags?: {
    hasPrimaryPhoto: boolean;
    photoCount: number;
  };
  filters?: {
    lookingFor?: string;
    locationPreference?: string;
    vision?: string;
    energy?: string;
    conflict_pace?: string;
  };
};

type PendingSwipe = {
  candidate: Candidate;
  action: "like" | "pass";
  timeoutId: number;
};

const visionOptions = [
  { value: "", label: "All visions" },
  { value: "independent", label: "Independent" },
  { value: "friendship", label: "Friendship" },
  { value: "safe", label: "Safe harbour" },
  { value: "adventure", label: "Adventure" },
  { value: "enmeshed", label: "Deeply intertwined" }
];

const energyOptions = [
  { value: "", label: "All energy" },
  { value: "social", label: "Social" },
  { value: "intellectual", label: "Intellectual" },
  { value: "spontaneous", label: "Spontaneous" },
  { value: "introspective", label: "Introspective" },
  { value: "high_energy", label: "High energy" }
];

const conflictOptions = [
  { value: "", label: "Any conflict pace" },
  { value: "talk-now", label: "Talk now" },
  { value: "balanced", label: "Balanced" },
  { value: "space-first", label: "Space first" }
];

const lookingForOptions = [
  { value: "", label: "All intent" },
  { value: "marriage_minded", label: "Marriage-minded" },
  { value: "serious_relationship", label: "Serious relationship" },
  { value: "exploring", label: "Exploring" }
];

const locationOptions = [
  { value: "", label: "Any distance" },
  { value: "same_city", label: "Same city" },
  { value: "relocatable", label: "Relocatable" },
  { value: "remote_ok", label: "Remote ok" }
];

async function postSwipe(candidateId: string, action: "like" | "pass") {
  const response = await fetch("/api/discover", {
    method: "POST",
    headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ candidateId, action })
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Could not save swipe.");
  }
  return (await response.json()) as { matched?: boolean; candidateFirstName?: string };
}

function SwipeCardContent({ candidate }: { candidate: Candidate }) {
  return (
    <>
      <div className="swipe-photo-wrap">
        {candidate.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={candidate.photoUrl} alt={`${candidate.firstName} profile`} className="swipe-photo" />
        ) : (
          <div className="swipe-photo-fallback">No photo yet</div>
        )}
        {candidate.likedYou ? <span className="trust-chip swipe-badge">Liked you</span> : null}
      </div>

      <div className="stack">
        <h3>{candidate.displayMeta.primaryLabel}</h3>
        <p className="muted tiny">{candidate.displayMeta.secondaryLabel}</p>
        <p className="small">{candidate.displayMeta.tagline}</p>
        <p className="small"><strong>Highlight:</strong> {candidate.compatibilityHighlight}</p>
        <p className="small"><strong>Watch for:</strong> {candidate.watchForInsight}</p>
      </div>
    </>
  );
}

function SwipeTopCard({
  candidate,
  onSwipe
}: {
  candidate: Candidate;
  onSwipe: (action: "like" | "pass", source: "drag") => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-12, 12]);
  const likeOpacity = useTransform(x, [24, 96], [0, 0.24]);
  const passOpacity = useTransform(x, [-96, -24], [0.24, 0]);
  const reducedMotion = useReducedMotion();

  return (
    <motion.article
      className="swipe-card"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.12}
      style={{ x, rotate: reducedMotion ? 0 : rotate }}
      transition={
        reducedMotion
          ? { duration: 0.16 }
          : {
              type: "spring",
              stiffness: 280,
              damping: 26,
              mass: 0.8
            }
      }
      onDragEnd={(_, info) => {
        const shouldLike = info.offset.x >= 96 || info.velocity.x >= 650;
        const shouldPass = info.offset.x <= -96 || info.velocity.x <= -650;

        if (shouldLike) {
          onSwipe("like", "drag");
          return;
        }
        if (shouldPass) {
          onSwipe("pass", "drag");
          return;
        }
        animate(x, 0, {
          type: "spring",
          stiffness: 280,
          damping: 26,
          mass: 0.8
        });
      }}
    >
      <motion.div className="swipe-overlay swipe-overlay-like" style={{ opacity: likeOpacity }}>
        <span>♥ Liked</span>
      </motion.div>
      <motion.div className="swipe-overlay swipe-overlay-pass" style={{ opacity: passOpacity }}>
        <span>✕ Passed</span>
      </motion.div>
      <SwipeCardContent candidate={candidate} />
    </motion.article>
  );
}

export function DiscoverFeed() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [incomingLikes, setIncomingLikes] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [matchBanner, setMatchBanner] = useState<string | null>(null);
  const [showRefine, setShowRefine] = useState(false);
  const [pendingSwipe, setPendingSwipe] = useState<PendingSwipe | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [swipeAck, setSwipeAck] = useState<"like" | "pass" | null>(null);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  const [vision, setVision] = useState("");
  const [energy, setEnergy] = useState("");
  const [conflictPace, setConflictPace] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [locationPreference, setLocationPreference] = useState("");

  const topCard = candidates[0] ?? null;
  const previewCard = candidates[1] ?? null;

  useEffect(() => {
    trackUxEvent("discover_viewed");
  }, []);

  const loadDiscover = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (vision) params.set("vision", vision);
    if (energy) params.set("energy", energy);
    if (conflictPace) params.set("conflict_pace", conflictPace);
    if (lookingFor) params.set("lookingFor", lookingFor);
    if (locationPreference) params.set("locationPreference", locationPreference);

    try {
      const response = await fetch(`/api/discover?${params.toString()}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not load discover feed.");
        return;
      }
      const payload = (await response.json()) as DiscoverResponse;
      setCandidates(payload.candidates ?? []);
      setIncomingLikes(payload.incomingLikes ?? []);
      setEmptyReason(payload.emptyReason ?? null);
      setProfileIncomplete(Boolean(payload.profileIncomplete));
      setMissingFields(payload.missingFields ?? []);
      trackUxEvent("discover_feed_loaded", {
        candidates: payload.candidates?.length ?? 0,
        incoming_likes: payload.incomingLikes?.length ?? 0,
        profile_incomplete: Boolean(payload.profileIncomplete)
      });
    } finally {
      setLoading(false);
    }
  }, [conflictPace, energy, locationPreference, lookingFor, vision]);

  useEffect(() => {
    void loadDiscover();
  }, [loadDiscover]);

  useEffect(() => {
    const next = candidates[1]?.photoUrl;
    if (!next) return;
    const img = new Image();
    img.src = next;
  }, [candidates]);

  useEffect(() => {
    return () => {
      if (pendingSwipe) {
        window.clearTimeout(pendingSwipe.timeoutId);
      }
    };
  }, [pendingSwipe]);

  useEffect(() => {
    if (!showRefine) return;
    trackUxEvent("discover_refine_opened");
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowRefine(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showRefine]);

  async function commitSwipe(candidate: Candidate, action: "like" | "pass") {
    try {
      const result = await postSwipe(candidate.id, action);
      if (result.matched) {
        setMatchBanner(`You and ${result.candidateFirstName ?? candidate.firstName} matched.`);
        trackUxEvent("discover_match_created", {
          action,
          liked_you_first: candidate.likedYou
        });
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(22);
        }
      }
    } catch (cause) {
      setCandidates((prev) => [candidate, ...prev]);
      if (candidate.likedYou) {
        setIncomingLikes((prev) => [candidate, ...prev.filter((item) => item.id !== candidate.id)]);
      }
      setError(cause instanceof Error ? cause.message : "Could not save swipe.");
    }
  }

  function commitPendingImmediately() {
    if (!pendingSwipe) return;
    window.clearTimeout(pendingSwipe.timeoutId);
    const pending = pendingSwipe;
    setPendingSwipe(null);
    setToast(null);
    void commitSwipe(pending.candidate, pending.action);
  }

  function queueSwipe(action: "like" | "pass", candidate: Candidate, source: "button" | "drag" | "incoming" = "button") {
    commitPendingImmediately();

    setCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
    setIncomingLikes((prev) => prev.filter((item) => item.id !== candidate.id));
    setSwipeAck(action);
    setToast(`${action === "like" ? "Liked" : "Passed"} ${candidate.firstName}`);
    trackUxEvent("discover_swipe", {
      action,
      source,
      liked_you_first: candidate.likedYou
    });

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }

    window.setTimeout(() => {
      setSwipeAck((prev) => (prev === action ? null : prev));
    }, 1200);

    const timeoutId = window.setTimeout(() => {
      setPendingSwipe(null);
      setToast(null);
      void commitSwipe(candidate, action);
    }, 3000);

    setPendingSwipe({ candidate, action, timeoutId });
  }

  function undoSwipe() {
    if (!pendingSwipe) return;
    window.clearTimeout(pendingSwipe.timeoutId);
    const candidate = pendingSwipe.candidate;
    setCandidates((prev) => [candidate, ...prev]);
    if (candidate.likedYou) {
      setIncomingLikes((prev) => [candidate, ...prev.filter((item) => item.id !== candidate.id)]);
    }
    setPendingSwipe(null);
    setToast(null);
    setSwipeAck(null);
    trackUxEvent("discover_swipe_undo", { action: pendingSwipe.action });
  }

  function clearFilters() {
    setVision("");
    setEnergy("");
    setConflictPace("");
    setLookingFor("");
    setLocationPreference("");
    trackUxEvent("discover_filters_cleared");
  }

  return (
    <>
      <section className="panel stack">
        <p className="eyebrow">Discover</p>
        <h1>Discover people who fit your rhythm.</h1>
        <p className="muted">Swipe with clarity. Every card highlights fit and friction in plain language.</p>

        <div className="stack">
          <div>
            <p className="tiny muted">Relationship vision</p>
            <div className="filter-strip">
              {visionOptions.map((option) => (
                <button
                  key={`vision-${option.value || "all"}`}
                  type="button"
                  className={vision === option.value ? "filter-chip active" : "filter-chip"}
                  aria-pressed={vision === option.value}
                  onClick={() => {
                    setVision(option.value);
                    trackUxEvent("discover_filter_set", { filter: "vision", value: option.value || "all" });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="tiny muted">Lifestyle energy</p>
            <div className="filter-strip">
              {energyOptions.map((option) => (
                <button
                  key={`energy-${option.value || "all"}`}
                  type="button"
                  className={energy === option.value ? "filter-chip active" : "filter-chip"}
                  aria-pressed={energy === option.value}
                  onClick={() => {
                    setEnergy(option.value);
                    trackUxEvent("discover_filter_set", { filter: "energy", value: option.value || "all" });
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="actions">
          <button type="button" className="ghost" onClick={() => setShowRefine(true)}>
            Refine
          </button>
          <button type="button" className="ghost" onClick={() => clearFilters()}>
            Reset
          </button>
        </div>
      </section>

      {showRefine ? (
        <>
          <div className="filter-sheet-backdrop" onClick={() => setShowRefine(false)} />
          <section className="filter-sheet stack" role="dialog" aria-modal="true" aria-label="Refine discover filters">
            <h2>Refine your feed</h2>

            <div className="stack">
              <p className="small"><strong>Conflict pace</strong></p>
              <div className="filter-strip">
                {conflictOptions.map((option) => (
                  <button
                    key={`conflict-${option.value || "all"}`}
                    type="button"
                    className={conflictPace === option.value ? "filter-chip active" : "filter-chip"}
                    aria-pressed={conflictPace === option.value}
                    onClick={() => {
                      setConflictPace(option.value);
                      trackUxEvent("discover_filter_set", { filter: "conflict_pace", value: option.value || "all" });
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="stack">
              <p className="small"><strong>Intent</strong></p>
              <div className="filter-strip">
                {lookingForOptions.map((option) => (
                  <button
                    key={`intent-${option.value || "all"}`}
                    type="button"
                    className={lookingFor === option.value ? "filter-chip active" : "filter-chip"}
                    aria-pressed={lookingFor === option.value}
                    onClick={() => {
                      setLookingFor(option.value);
                      trackUxEvent("discover_filter_set", { filter: "intent", value: option.value || "all" });
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="stack">
              <p className="small"><strong>Distance</strong></p>
              <div className="filter-strip">
                {locationOptions.map((option) => (
                  <button
                    key={`distance-${option.value || "all"}`}
                    type="button"
                    className={locationPreference === option.value ? "filter-chip active" : "filter-chip"}
                    aria-pressed={locationPreference === option.value}
                    onClick={() => {
                      setLocationPreference(option.value);
                      trackUxEvent("discover_filter_set", { filter: "distance", value: option.value || "all" });
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="actions">
              <button type="button" onClick={() => setShowRefine(false)}>Done</button>
            </div>
          </section>
        </>
      ) : null}

      {profileIncomplete ? (
        <section className="panel stack">
          <h2>Finish your profile to unlock Discover</h2>
          <p className="muted">
            Complete your setup first: {missingFields.join(", ").replaceAll("_", " ")}.
          </p>
          <div className="actions">
            <Link href="/profile/setup" className="button-link">Open profile setup</Link>
          </div>
        </section>
      ) : null}

      {matchBanner ? (
        <section className="panel panel-tight">
          <p className="inline-ok">{matchBanner}</p>
        </section>
      ) : null}

      {error ? (
        <section className="panel panel-tight">
          <p role="alert" className="inline-error">{error}</p>
        </section>
      ) : null}

      {incomingLikes.length > 0 ? (
        <section className="panel stack">
          <h2>People who liked you</h2>
          {incomingLikes.map((candidate) => (
            <article key={`incoming-${candidate.id}`} className="prompt-card">
              <strong>{candidate.displayMeta.primaryLabel}</strong>
              <p className="muted tiny">{candidate.displayMeta.secondaryLabel}</p>
              <p className="small">{candidate.displayMeta.tagline}</p>
              <div className="actions">
                <button type="button" className="ghost" onClick={() => queueSwipe("pass", candidate, "incoming")}>Pass</button>
                <button type="button" onClick={() => queueSwipe("like", candidate, "incoming")}>Like back</button>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="panel stack">
        <h2>Swipe stack</h2>
        {swipeAck ? <p className="tiny inline-ok">{swipeAck === "like" ? "Liked" : "Passed"}</p> : null}

        {loading ? (
          <div className="swipe-stack" aria-label="Discover cards loading">
            <article className="swipe-card swipe-card-skeleton">
              <div className="swipe-photo-wrap swipe-photo-skeleton" />
              <div className="stack">
                <div className="skeleton-line skeleton-line-lg" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
              </div>
            </article>
          </div>
        ) : null}

        {!loading && !topCard ? <p className="muted">{emptyReason ?? "No new profiles in this filter set. Try widening one filter."}</p> : null}

        {topCard ? (
          <div className="swipe-stack" aria-label="Discover cards">
            {previewCard ? (
              <article className="swipe-card swipe-card-preview" aria-hidden="true">
                <SwipeCardContent candidate={previewCard} />
              </article>
            ) : null}

            <SwipeTopCard
              candidate={topCard}
              onSwipe={(action, source) => {
                queueSwipe(action, topCard, source);
              }}
            />
          </div>
        ) : null}

        {topCard ? (
          <div className="actions">
            <button type="button" className="ghost" onClick={() => queueSwipe("pass", topCard, "button")}>Pass</button>
            <button type="button" onClick={() => queueSwipe("like", topCard, "button")}>Like</button>
          </div>
        ) : null}
      </section>

      {toast && pendingSwipe ? (
        <div className="swipe-toast" role="status" aria-live="polite">
          <span>{toast}</span>
          <button type="button" onClick={() => undoSwipe()}>
            Undo
          </button>
        </div>
      ) : null}
    </>
  );
}
