"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { withCsrfHeaders } from "@/components/auth/csrf";
import { PhotosManager } from "@/components/me/PhotosManager";
import { ProfilePreviewCard } from "@/components/me/ProfilePreviewCard";
import { ProfileSectionCard } from "@/components/me/ProfileSectionCard";

type SetupState = {
  completionPercent: number;
  missingRequired: string[];
  photoCount: number;
  isComplete: boolean;
};

export type ProfileRecord = {
  userId: string;
  dateOfBirth: string | null;
  currentCity: string | null;
  genderIdentity: string | null;
  interestedIn: string[];
  relationshipIntention: string | null;
  sexualOrientation: string | null;
  heightCm: number | null;
  work: string | null;
  education: string | null;
  bio: string | null;
  promptAnswer: string | null;
  distanceKm: number | null;
  drinking: string | null;
  smoking: string | null;
  exercise: string | null;
  religion: string | null;
  politics: string | null;
  familyPlans: string | null;
  pets: string | null;
  interests: string[];
  setupCompleted: boolean;
};

type ProfilePayload = {
  profile: ProfileRecord | null;
  setup: SetupState;
};

const intentOptions = [
  { value: "marriage_minded", label: "Marriage-minded" },
  { value: "serious_relationship", label: "Serious relationship" },
  { value: "exploring", label: "Exploring" },
  { value: "casual", label: "Casual" },
  { value: "unsure", label: "Unsure" }
];

const interestOptions = ["Women", "Men", "Non-binary people", "Everyone"];

function asNumberOrNull(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function ProfileHub({ firstName }: { firstName: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupState>({
    completionPercent: 0,
    missingRequired: [],
    photoCount: 0,
    isComplete: false
  });

  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const [dateOfBirth, setDateOfBirth] = useState("");
  const [currentCity, setCurrentCity] = useState("");
  const [genderIdentity, setGenderIdentity] = useState("");
  const [interestedIn, setInterestedIn] = useState<string[]>([]);
  const [relationshipIntention, setRelationshipIntention] = useState("serious_relationship");

  const [sexualOrientation, setSexualOrientation] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [distanceKm, setDistanceKm] = useState("");

  const [work, setWork] = useState("");
  const [education, setEducation] = useState("");
  const [drinking, setDrinking] = useState("");
  const [smoking, setSmoking] = useState("");
  const [exercise, setExercise] = useState("");
  const [religion, setReligion] = useState("");
  const [politics, setPolitics] = useState("");
  const [familyPlans, setFamilyPlans] = useState("");
  const [pets, setPets] = useState("");

  const [bio, setBio] = useState("");
  const [promptAnswer, setPromptAnswer] = useState("");
  const [interestsInput, setInterestsInput] = useState("");

  const interests = useMemo(
    () =>
      interestsInput
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .slice(0, 12),
    [interestsInput]
  );

  async function refreshProfile() {
    const response = await fetch("/api/profile/me", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load profile.");
    }

    const payload = (await response.json()) as ProfilePayload;
    setSetup(payload.setup);
    setProfile(payload.profile ?? null);

    if (payload.profile) {
      setDateOfBirth(payload.profile.dateOfBirth ?? "");
      setCurrentCity(payload.profile.currentCity ?? "");
      setGenderIdentity(payload.profile.genderIdentity ?? "");
      setInterestedIn(payload.profile.interestedIn ?? []);
      setRelationshipIntention(payload.profile.relationshipIntention ?? "serious_relationship");

      setSexualOrientation(payload.profile.sexualOrientation ?? "");
      setHeightCm(payload.profile.heightCm ? String(payload.profile.heightCm) : "");
      setDistanceKm(payload.profile.distanceKm ? String(payload.profile.distanceKm) : "");

      setWork(payload.profile.work ?? "");
      setEducation(payload.profile.education ?? "");
      setDrinking(payload.profile.drinking ?? "");
      setSmoking(payload.profile.smoking ?? "");
      setExercise(payload.profile.exercise ?? "");
      setReligion(payload.profile.religion ?? "");
      setPolitics(payload.profile.politics ?? "");
      setFamilyPlans(payload.profile.familyPlans ?? "");
      setPets(payload.profile.pets ?? "");

      setBio(payload.profile.bio ?? "");
      setPromptAnswer(payload.profile.promptAnswer ?? "");
      setInterestsInput((payload.profile.interests ?? []).join(", "));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      setLoading(true);
      setError(null);
      try {
        await refreshProfile();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load profile.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePatch(patch: Record<string, unknown>, successMessage: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setOk(null);
    const response = await fetch("/api/profile/me", {
      method: "PUT",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch)
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not save profile changes.");
      setSaving(false);
      return;
    }

    const payload = (await response.json()) as ProfilePayload;
    setSetup(payload.setup);
    setProfile(payload.profile ?? null);
    setOk(successMessage);
    setSaving(false);
  }

  async function onSaveEssentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await savePatch(
      {
        date_of_birth: dateOfBirth,
        current_city: currentCity,
        gender_identity: genderIdentity,
        interested_in: interestedIn,
        relationship_intention: relationshipIntention
      },
      "Essentials updated."
    );
  }

  async function onSavePreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await savePatch(
      {
        sexual_orientation: sexualOrientation,
        height_cm: asNumberOrNull(heightCm),
        distance_km: asNumberOrNull(distanceKm)
      },
      "Preferences updated."
    );
  }

  async function onSaveLifestyle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await savePatch(
      {
        work,
        education,
        drinking,
        smoking,
        exercise,
        religion,
        politics,
        family_plans: familyPlans,
        pets
      },
      "Lifestyle details updated."
    );
  }

  async function onSaveAbout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await savePatch(
      {
        bio,
        prompt_answer: promptAnswer,
        interests
      },
      "About section updated."
    );
  }

  if (loading) {
    return (
      <section className="panel stack">
        <p className="muted">Loading profile...</p>
      </section>
    );
  }

  return (
    <div className="stack">
      <ProfilePreviewCard
        firstName={firstName}
        profile={profile}
        photoUrl={photoPreview}
        completionPercent={setup.completionPercent}
      />

      <ProfileSectionCard
        title="Photos"
        description="Drag to reorder, replace any slot, and keep at least two photos live."
      >
        <PhotosManager
          onCountChange={(count) => {
            setSetup((prev) => ({ ...prev, photoCount: count }));
            void refreshProfile().catch(() => undefined);
          }}
          onPhotosChange={(items) => setPhotoPreview(items[0]?.url ?? null)}
        />
      </ProfileSectionCard>

      <ProfileSectionCard title="Essentials" description="These are required before Discover and Matches unlock.">
        <form className="stack" onSubmit={(event) => void onSaveEssentials(event)}>
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
            <input value={genderIdentity} onChange={(event) => setGenderIdentity(event.target.value)} required />
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
            Looking for
            <select value={relationshipIntention} onChange={(event) => setRelationshipIntention(event.target.value)}>
              {intentOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <div className="actions">
            <button type="submit" disabled={saving}>Save essentials</button>
          </div>
        </form>
      </ProfileSectionCard>

      <ProfileSectionCard title="Preferences">
        <form className="stack" onSubmit={(event) => void onSavePreferences(event)}>
          <label>
            Sexual orientation
            <input value={sexualOrientation} onChange={(event) => setSexualOrientation(event.target.value)} />
          </label>
          <label>
            Height (cm)
            <input
              type="number"
              min={120}
              max={240}
              value={heightCm}
              onChange={(event) => setHeightCm(event.target.value)}
            />
          </label>
          <label>
            Distance preference (km)
            <input
              type="number"
              min={1}
              max={500}
              value={distanceKm}
              onChange={(event) => setDistanceKm(event.target.value)}
            />
          </label>
          <div className="actions">
            <button type="submit" disabled={saving}>Save preferences</button>
          </div>
        </form>
      </ProfileSectionCard>

      <ProfileSectionCard title="Lifestyle">
        <form className="stack" onSubmit={(event) => void onSaveLifestyle(event)}>
          <label>
            Work
            <input value={work} onChange={(event) => setWork(event.target.value)} />
          </label>
          <label>
            Education
            <input value={education} onChange={(event) => setEducation(event.target.value)} />
          </label>
          <label>
            Drinking
            <input value={drinking} onChange={(event) => setDrinking(event.target.value)} />
          </label>
          <label>
            Smoking
            <input value={smoking} onChange={(event) => setSmoking(event.target.value)} />
          </label>
          <label>
            Exercise
            <input value={exercise} onChange={(event) => setExercise(event.target.value)} />
          </label>
          <label>
            Religion
            <input value={religion} onChange={(event) => setReligion(event.target.value)} />
          </label>
          <label>
            Politics
            <input value={politics} onChange={(event) => setPolitics(event.target.value)} />
          </label>
          <label>
            Family plans
            <input value={familyPlans} onChange={(event) => setFamilyPlans(event.target.value)} />
          </label>
          <label>
            Pets
            <input value={pets} onChange={(event) => setPets(event.target.value)} />
          </label>

          <div className="actions">
            <button type="submit" disabled={saving}>Save lifestyle</button>
          </div>
        </form>
      </ProfileSectionCard>

      <ProfileSectionCard title="About" description="Add a short bio and interests so your profile feels human.">
        <form className="stack" onSubmit={(event) => void onSaveAbout(event)}>
          <label>
            Bio
            <textarea
              rows={4}
              maxLength={280}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          <label>
            Prompt answer: A relationship feels right when...
            <textarea
              rows={3}
              maxLength={280}
              value={promptAnswer}
              onChange={(event) => setPromptAnswer(event.target.value)}
            />
          </label>
          <label>
            Interests (comma separated)
            <input value={interestsInput} onChange={(event) => setInterestsInput(event.target.value)} />
          </label>
          <div className="actions">
            <button type="submit" disabled={saving}>Save about</button>
          </div>
        </form>
      </ProfileSectionCard>

      <ProfileSectionCard title="Relationship DNA">
        <p className="muted">Your compatibility DNA is ready anytime you want to review it.</p>
        <div className="actions">
          <Link href="/results" className="button-link ghost">View relationship DNA</Link>
          <Link href="/guest" className="button-link ghost">Guest compatibility</Link>
        </div>
      </ProfileSectionCard>

      {setup.missingRequired.length > 0 ? (
        <section className="panel">
          <p className="muted small">Still needed before full unlock: {setup.missingRequired.join(", ").replaceAll("_", " ")}.</p>
        </section>
      ) : null}

      {ok ? <p className="inline-ok">{ok}</p> : null}
      {error ? <p role="alert" className="inline-error">{error}</p> : null}
    </div>
  );
}
