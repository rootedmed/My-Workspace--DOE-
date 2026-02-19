"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { trackUxEvent } from "@/lib/observability/uxClient";

type ProfileRecord = {
  userId: string;
  dateOfBirth: string | null;
  currentCity: string | null;
  genderIdentity: string | null;
  interestedIn: string[];
  relationshipIntention: string | null;
  bio: string | null;
  promptAnswer: string | null;
  setupCompleted: boolean;
};

type ProfileSetupPayload = {
  profile: ProfileRecord | null;
  setup: {
    completionPercent: number;
    missingRequired: string[];
    photoCount: number;
    isComplete: boolean;
  };
};

type UserPhoto = {
  id: string;
  slot: number;
  displayOrder: number;
  url: string;
};

const intentOptions = [
  { value: "marriage_minded", label: "Marriage-minded" },
  { value: "serious_relationship", label: "Serious relationship" },
  { value: "exploring", label: "Exploring" }
];

const genderOptions = ["Woman", "Man", "Non-binary", "Trans woman", "Trans man"];
const interestOptions = ["Women", "Men", "Non-binary people", "Everyone"];

function getInitialStep(payload: ProfileSetupPayload | null): number {
  if (!payload) return 1;
  const missing = new Set(payload.setup.missingRequired);
  if (
    missing.has("date_of_birth") ||
    missing.has("current_city") ||
    missing.has("gender_identity") ||
    missing.has("interested_in") ||
    missing.has("relationship_intention")
  ) {
    return 1;
  }
  if (missing.has("photos")) return 2;
  if (missing.has("about")) return 3;
  return 4;
}

export function ProfileSetupWizard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileSetupPayload | null>(null);
  const [photos, setPhotos] = useState<UserPhoto[]>([]);

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [currentCity, setCurrentCity] = useState("");
  const [genderIdentity, setGenderIdentity] = useState("");
  const [interestedIn, setInterestedIn] = useState<string[]>([]);
  const [relationshipIntention, setRelationshipIntention] = useState("serious_relationship");
  const [bio, setBio] = useState("");
  const [promptAnswer, setPromptAnswer] = useState("");

  const canContinueIdentity =
    dateOfBirth.length > 0 &&
    currentCity.trim().length > 0 &&
    genderIdentity.trim().length > 0 &&
    interestedIn.length > 0 &&
    relationshipIntention.length > 0;
  const canContinuePhotos = photos.length >= 2;
  const canContinueAbout = bio.trim().length > 0 || promptAnswer.trim().length > 0;

  const progressValue = useMemo(() => {
    if (step <= 1) return 25;
    if (step === 2) return 55;
    if (step === 3) return 80;
    return 100;
  }, [step]);

  async function loadProfileState() {
    const [profileRes, photosRes] = await Promise.all([
      fetch("/api/profile/me", { cache: "no-store" }),
      fetch("/api/photos", { cache: "no-store" })
    ]);

    if (!profileRes.ok) {
      throw new Error("Could not load profile setup.");
    }

    const payload = (await profileRes.json()) as ProfileSetupPayload;
    setProfile(payload);
    setStep(getInitialStep(payload));

    if (payload.profile) {
      setDateOfBirth(payload.profile.dateOfBirth ?? "");
      setCurrentCity(payload.profile.currentCity ?? "");
      setGenderIdentity(payload.profile.genderIdentity ?? "");
      setInterestedIn(payload.profile.interestedIn ?? []);
      setRelationshipIntention(payload.profile.relationshipIntention ?? "serious_relationship");
      setBio(payload.profile.bio ?? "");
      setPromptAnswer(payload.profile.promptAnswer ?? "");
    }

    if (photosRes.ok) {
      const photoPayload = (await photosRes.json()) as { photos: UserPhoto[] };
      setPhotos((photoPayload.photos ?? []).sort((a, b) => a.displayOrder - b.displayOrder));
    }
  }

  useEffect(() => {
    trackUxEvent("profile_setup_viewed");
    let cancelled = false;

    async function hydrate() {
      setLoading(true);
      setError(null);
      try {
        await loadProfileState();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load profile setup.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveIdentity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canContinueIdentity || saving) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/me", {
        method: "PUT",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          date_of_birth: dateOfBirth,
          current_city: currentCity,
          gender_identity: genderIdentity,
          interested_in: interestedIn,
          relationship_intention: relationshipIntention
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not save identity step.");
      }
      trackUxEvent("profile_setup_identity_saved");
      await loadProfileState();
      setStep(2);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save identity step.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadToSlot(slot: number, file: File) {
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("slot", String(slot));
      formData.append("file", file);

      const response = await fetch("/api/photos", {
        method: "POST",
        headers: await withCsrfHeaders(),
        body: formData
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not upload photo.");
      }

      const payload = (await response.json()) as { photo: UserPhoto };
      setPhotos((prev) => {
        const next = [...prev.filter((item) => item.id !== payload.photo.id && item.slot !== payload.photo.slot), payload.photo];
        return next.sort((a, b) => a.displayOrder - b.displayOrder);
      });
      trackUxEvent("profile_setup_photo_uploaded");
      await loadProfileState();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not upload photo.");
    } finally {
      setSaving(false);
    }
  }

  async function saveAbout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canContinueAbout || saving) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/me", {
        method: "PUT",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          bio,
          prompt_answer: promptAnswer
        })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not save about step.");
      }
      trackUxEvent("profile_setup_about_saved");
      await loadProfileState();
      setStep(4);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save about step.");
    } finally {
      setSaving(false);
    }
  }

  async function completeSetup() {
    if (saving) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile/setup/complete", {
        method: "POST",
        headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({})
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Could not complete setup.");
      }
      trackUxEvent("profile_setup_completed");
      router.push("/discover");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete setup.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="panel stack">
        <p className="muted">Loading profile setup...</p>
      </section>
    );
  }

  return (
    <section className="panel stack profile-setup-shell">
      <header className="stack">
        <p className="eyebrow">Profile setup</p>
        <h1>Let’s finish your profile</h1>
        <p className="muted">Three quick steps before you unlock Discover and Matches.</p>
        <div className="onboarding-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressValue}>
          <span className="onboarding-progress-fill" style={{ width: `${progressValue}%` }} />
        </div>
      </header>

      {profile ? (
        <section className="prompt-card">
          <p className="small"><strong>Completion:</strong> {profile.setup.completionPercent}%</p>
          {profile.setup.missingRequired.length > 0 ? (
            <p className="muted tiny">Still needed: {profile.setup.missingRequired.join(", ").replaceAll("_", " ")}</p>
          ) : (
            <p className="inline-ok tiny">All required fields are complete.</p>
          )}
        </section>
      ) : null}

      {step === 1 ? (
        <form className="stack" onSubmit={saveIdentity}>
          <h2>Step 1: identity and intent</h2>
          <label>
            Date of birth
            <input type="date" value={dateOfBirth} onChange={(event) => setDateOfBirth(event.target.value)} required />
          </label>
          <label>
            Current city
            <input value={currentCity} onChange={(event) => setCurrentCity(event.target.value)} required />
          </label>
          <label>
            Gender identity
            <select value={genderIdentity} onChange={(event) => setGenderIdentity(event.target.value)} required>
              <option value="">Select</option>
              {genderOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </label>

          <fieldset className="field-group">
            <legend>Interested in</legend>
            <div className="chip-grid">
              {interestOptions.map((option) => {
                const selected = interestedIn.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    className={selected ? "filter-chip active" : "filter-chip"}
                    aria-pressed={selected}
                    onClick={() => {
                      setInterestedIn((prev) =>
                        prev.includes(option) ? prev.filter((item) => item !== option) : [...prev, option]
                      );
                    }}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label>
            Relationship intention
            <select
              value={relationshipIntention}
              onChange={(event) => setRelationshipIntention(event.target.value)}
              required
            >
              {intentOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="actions">
            <button type="submit" disabled={!canContinueIdentity || saving}>
              {saving ? "Saving..." : "Continue"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <section className="stack">
          <h2>Step 2: photo trust</h2>
          <p className="muted">Add at least 2 photos. Lead with a clear face photo.</p>

          <div className="photo-grid" aria-label="Profile setup photos">
            {Array.from({ length: 6 }).map((_, index) => {
              const slot = index + 1;
              const slotPhoto = photos.find((photo) => photo.slot === slot) ?? null;
              return (
                <article key={`setup-photo-slot-${slot}`} className="photo-slot">
                  {slotPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slotPhoto.url} alt={`Photo ${slot}`} className="photo-preview" />
                  ) : (
                    <span>Photo {slot}</span>
                  )}
                  <label className="upload-button">
                    {slotPhoto ? "Replace" : "Upload"}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={saving}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        void uploadToSlot(slot, file);
                        event.currentTarget.value = "";
                      }}
                    />
                  </label>
                </article>
              );
            })}
          </div>

          <div className="actions">
            <button type="button" className="ghost" onClick={() => setStep(1)} disabled={saving}>Back</button>
            <button type="button" onClick={() => setStep(3)} disabled={!canContinuePhotos || saving}>
              Continue
            </button>
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <form className="stack" onSubmit={saveAbout}>
          <h2>Step 3: about you</h2>
          <label>
            Short bio (optional if you answer prompt)
            <textarea
              rows={4}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              maxLength={280}
              placeholder="What should someone know about you?"
            />
          </label>
          <label>
            Prompt: “A relationship feels right when...”
            <textarea
              rows={3}
              value={promptAnswer}
              onChange={(event) => setPromptAnswer(event.target.value)}
              maxLength={280}
              placeholder="Finish the sentence in your own words."
            />
          </label>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setStep(2)} disabled={saving}>Back</button>
            <button type="submit" disabled={!canContinueAbout || saving}>
              {saving ? "Saving..." : "Review"}
            </button>
          </div>
        </form>
      ) : null}

      {step === 4 ? (
        <section className="stack">
          <h2>Ready to unlock your feed</h2>
          <p className="muted">Your profile is strong enough to start matching. You can add optional details anytime.</p>
          <div className="actions">
            <button type="button" className="ghost" onClick={() => setStep(3)} disabled={saving}>Back</button>
            <button type="button" onClick={() => void completeSetup()} disabled={saving}>
              {saving ? "Finishing..." : "Start discovering"}
            </button>
          </div>
        </section>
      ) : null}

      {error ? <p role="alert" className="inline-error">{error}</p> : null}
    </section>
  );
}
