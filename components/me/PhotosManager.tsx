"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { withCsrfHeaders } from "@/components/auth/csrf";

type UserPhoto = {
  id: string;
  slot: number;
  mimeType: string;
  storagePath: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

type PhotosResponse = {
  photos: UserPhoto[];
};

export function PhotosManager() {
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const photosBySlot = useMemo(
    () => new Map(photos.map((photo) => [photo.slot, photo])),
    [photos]
  );

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/photos", { cache: "no-store" });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? "Could not load photos.");
        return;
      }
      const payload = (await response.json()) as PhotosResponse;
      setPhotos(payload.photos ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPhotos();
  }, [loadPhotos]);

  async function uploadPhoto(slot: number, file: File) {
    setError(null);
    setSavedMessage(null);
    setUploadingSlot(slot);

    const formData = new FormData();
    formData.append("slot", String(slot));
    formData.append("file", file);

    try {
      const response = await fetch("/api/photos", {
        method: "POST",
        headers: await withCsrfHeaders(),
        body: formData
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; details?: { message?: string | null; code?: string | null } }
          | null;
        const detail = payload?.details?.message ?? payload?.details?.code ?? "";
        setError(`${payload?.error ?? "Could not upload photo."}${detail ? ` ${detail}` : ""}`);
        return;
      }

      const payload = (await response.json()) as { photo: UserPhoto };
      setPhotos((prev) => {
        const withoutSlot = prev.filter((row) => row.slot !== payload.photo.slot);
        return [...withoutSlot, payload.photo].sort((a, b) => a.slot - b.slot);
      });
      setSavedMessage(`Photo ${slot} saved.`);
    } finally {
      setUploadingSlot(null);
    }
  }

  return (
    <section className="panel stack">
      <div className="actions">
        <button type="button" className="ghost" onClick={() => void loadPhotos()} disabled={loading}>
          Refresh photos
        </button>
      </div>

      {loading ? <p className="muted">Loading photos...</p> : null}
      {error ? <p role="alert" className="inline-error">{error}</p> : null}
      {savedMessage ? <p className="inline-ok">{savedMessage}</p> : null}

      <div className="photo-grid" aria-label="Profile photos">
        {Array.from({ length: 6 }).map((_, index) => {
          const slot = index + 1;
          const slotPhoto = photosBySlot.get(slot);
          return (
            <article key={`photo-slot-${slot}`} className="photo-slot">
              {slotPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slotPhoto.url} alt={`Profile photo ${slot}`} className="photo-preview" />
              ) : (
                <span>Photo {slot}</span>
              )}
              <label className="upload-button">
                {uploadingSlot === slot ? "Uploading..." : slotPhoto ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingSlot === slot}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    void uploadPhoto(slot, file);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
            </article>
          );
        })}
      </div>
    </section>
  );
}
