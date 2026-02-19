import type { ProfileRecord } from "@/components/me/ProfileHub";

function ageFromDate(dateString: string | null): number | null {
  if (!dateString) return null;
  const dob = new Date(dateString);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age >= 18 ? age : null;
}

export function ProfilePreviewCard({
  firstName,
  profile,
  photoUrl,
  completionPercent
}: {
  firstName: string;
  profile: ProfileRecord | null;
  photoUrl: string | null;
  completionPercent: number;
}) {
  const age = ageFromDate(profile?.dateOfBirth ?? null);

  return (
    <section className="panel stack">
      <p className="eyebrow">Profile preview</p>
      <article className="profile-preview-card">
        <div className="profile-preview-photo-wrap">
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt={`${firstName} profile`} className="profile-preview-photo" />
          ) : (
            <div className="profile-preview-fallback">Add a photo</div>
          )}
        </div>
        <div className="stack">
          <h2>
            {firstName}
            {age ? `, ${age}` : ""}
          </h2>
          {profile?.currentCity ? <p className="muted">{profile.currentCity}</p> : null}
          {profile?.relationshipIntention ? (
            <p className="small">Looking for: {profile.relationshipIntention.replaceAll("_", " ")}</p>
          ) : null}
          {profile?.bio ? <p className="small">{profile.bio}</p> : null}
          {profile?.promptAnswer ? <p className="small">A relationship feels right when {profile.promptAnswer}</p> : null}
        </div>
      </article>

      <div className="stack">
        <p className="tiny muted">Profile strength</p>
        <div className="onboarding-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completionPercent}>
          <span className="onboarding-progress-fill" style={{ width: `${completionPercent}%` }} />
        </div>
        <p className="small">
          <strong>{completionPercent}% complete</strong>
        </p>
      </div>
    </section>
  );
}
