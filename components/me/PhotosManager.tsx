"use client";

import { type DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import { withCsrfHeaders } from "@/components/auth/csrf";

type UserPhoto = {
  id: string;
  slot: number;
  displayOrder: number;
  mimeType: string;
  storagePath: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

type PhotosResponse = {
  photos: UserPhoto[];
};

export function PhotosManager({
  onCountChange,
  onPhotosChange,
  compact = false
}: {
  onCountChange?: (count: number) => void;
  onPhotosChange?: (photos: UserPhoto[]) => void;
  compact?: boolean;
}) {
  const [photos, setPhotos] = useState<UserPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const orderedPhotos = useMemo(
    () => [...photos].sort((a, b) => a.displayOrder - b.displayOrder || a.slot - b.slot),
    [photos]
  );

  const photosBySlot = useMemo(() => new Map(photos.map((photo) => [photo.slot, photo])), [photos]);

  useEffect(() => {
    onCountChange?.(photos.length);
    onPhotosChange?.(orderedPhotos);
  }, [onCountChange, onPhotosChange, orderedPhotos, photos.length]);

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
        const withoutSlot = prev.filter((row) => row.slot !== payload.photo.slot && row.id !== payload.photo.id);
        return [...withoutSlot, payload.photo].sort((a, b) => a.displayOrder - b.displayOrder || a.slot - b.slot);
      });
      setSavedMessage(`Photo ${slot} saved.`);
    } finally {
      setUploadingSlot(null);
    }
  }

  async function deletePhoto(photoId: string) {
    setError(null);
    setSavedMessage(null);

    const response = await fetch(`/api/photos?id=${photoId}`, {
      method: "DELETE",
      headers: await withCsrfHeaders()
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not delete photo.");
      return;
    }

    setPhotos((prev) => prev.filter((photo) => photo.id !== photoId));
    setSavedMessage("Photo removed.");
  }

  async function saveOrder(nextOrderedIds: string[]) {
    setSavingOrder(true);
    setError(null);
    const response = await fetch("/api/photos/reorder", {
      method: "POST",
      headers: await withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ orderedPhotoIds: nextOrderedIds })
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? "Could not save photo order.");
      setSavingOrder(false);
      return;
    }

    setPhotos((prev) => {
      const byId = new Map(prev.map((photo) => [photo.id, photo]));
      return nextOrderedIds
        .map((id, index) => {
          const existing = byId.get(id);
          if (!existing) return null;
          return {
            ...existing,
            displayOrder: index + 1
          };
        })
        .filter((photo): photo is UserPhoto => Boolean(photo));
    });

    setSavedMessage("Photo order updated.");
    setSavingOrder(false);
  }

  function movePhoto(photoId: string, direction: "left" | "right") {
    const index = orderedPhotos.findIndex((photo) => photo.id === photoId);
    if (index < 0) return;
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= orderedPhotos.length) return;

    const next = [...orderedPhotos];
    const [item] = next.splice(index, 1);
    if (!item) return;
    next.splice(targetIndex, 0, item);
    void saveOrder(next.map((photo) => photo.id));
  }

  function onDragStart(event: DragEvent<HTMLElement>, photoId: string) {
    event.dataTransfer.setData("text/plain", photoId);
    event.dataTransfer.effectAllowed = "move";
  }

  function onDrop(event: DragEvent<HTMLElement>, targetPhotoId: string) {
    event.preventDefault();
    const sourcePhotoId = event.dataTransfer.getData("text/plain");
    if (!sourcePhotoId || sourcePhotoId === targetPhotoId) return;

    const sourceIndex = orderedPhotos.findIndex((photo) => photo.id === sourcePhotoId);
    const targetIndex = orderedPhotos.findIndex((photo) => photo.id === targetPhotoId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const next = [...orderedPhotos];
    const [item] = next.splice(sourceIndex, 1);
    if (!item) return;
    next.splice(targetIndex, 0, item);
    void saveOrder(next.map((photo) => photo.id));
  }

  return (
    <section className="panel stack">
      <div className="actions">
        <button type="button" className="ghost" onClick={() => void loadPhotos()} disabled={loading || savingOrder}>
          Refresh photos
        </button>
      </div>

      {loading ? <p className="muted">Loading photos...</p> : null}
      {error ? <p role="alert" className="inline-error">{error}</p> : null}
      {savedMessage ? <p className="inline-ok">{savedMessage}</p> : null}

      {orderedPhotos.length > 0 ? (
        <div className="photo-reorder-list" aria-label="Reorder photos">
          {orderedPhotos.map((photo, index) => (
            <article
              key={photo.id}
              className="photo-reorder-item"
              draggable
              onDragStart={(event) => onDragStart(event, photo.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => onDrop(event, photo.id)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={`Profile photo ${index + 1}`} className="photo-reorder-thumb" />
              <div className="photo-reorder-meta">
                <p className="small"><strong>Photo {index + 1}</strong></p>
                <p className="tiny muted">Drag to reorder</p>
              </div>
              <div className="actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => movePhoto(photo.id, "left")}
                  disabled={index === 0 || savingOrder}
                >
                  Move up
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => movePhoto(photo.id, "right")}
                  disabled={index === orderedPhotos.length - 1 || savingOrder}
                >
                  Move down
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void deletePhoto(photo.id)}
                  disabled={savingOrder}
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className={compact ? "photo-grid compact" : "photo-grid"} aria-label="Profile photos">
        {Array.from({ length: 6 }).map((_, index) => {
          const slot = index + 1;
          const slotPhoto = photosBySlot.get(slot);
          return (
            <article key={`photo-slot-${slot}`} className="photo-slot">
              {slotPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={slotPhoto.url} alt={`Profile photo slot ${slot}`} className="photo-preview" />
              ) : (
                <span>Photo {slot}</span>
              )}
              <label className="upload-button">
                {uploadingSlot === slot ? "Uploading..." : slotPhoto ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingSlot === slot || savingOrder}
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
