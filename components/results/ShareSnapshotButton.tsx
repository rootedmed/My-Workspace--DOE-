"use client";

import { useMemo, useState } from "react";
import { trackUxEvent } from "@/lib/observability/uxClient";

type SnapshotPayload = {
  attachmentStyle: string;
  conflictStyle: string;
  loveExpression: string;
  relationshipVision: string;
};

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(" ");
  let line = "";
  let offsetY = y;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? "";
    const test = line ? `${line} ${word}` : word;
    const width = ctx.measureText(test).width;
    if (width > maxWidth && line) {
      ctx.fillText(line, x, offsetY);
      line = word;
      offsetY += lineHeight;
    } else {
      line = test;
    }
  }

  if (line) {
    ctx.fillText(line, x, offsetY);
  }
  return offsetY + lineHeight;
}

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not render image."));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

export function ShareSnapshotButton({ data, appName }: { data: SnapshotPayload; appName: string }) {
  const [isWorking, setIsWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const rows = useMemo<Array<[string, string]>>(
    () => [
      ["Attachment Style", data.attachmentStyle],
      ["Conflict Style", data.conflictStyle],
      ["Love Expression", data.loveExpression],
      ["Relationship Vision", data.relationshipVision]
    ],
    [data]
  );

  async function handleShare() {
    if (isWorking) return;
    setIsWorking(true);
    setMessage(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas is unavailable.");
      }

      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#F4E4D3");
      gradient.addColorStop(0.55, "#E6B694");
      gradient.addColorStop(1, "#BA4E3D");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.fillRect(90, 120, canvas.width - 180, canvas.height - 260);

      ctx.fillStyle = "#2E2A27";
      ctx.font = "700 52px Fraunces, Georgia, serif";
      ctx.fillText("Your Relationship DNA", 140, 260);

      let cursorY = 350;
      for (const [label, value] of rows) {
        ctx.fillStyle = "#7A6155";
        ctx.font = "600 28px 'Plus Jakarta Sans', 'Segoe UI', sans-serif";
        ctx.fillText(label, 140, cursorY);

        ctx.fillStyle = "#1F2329";
        ctx.font = "700 44px 'Plus Jakarta Sans', 'Segoe UI', sans-serif";
        cursorY = wrapText(ctx, value, 140, cursorY + 66, canvas.width - 280, 58);
        cursorY += 24;
      }

      ctx.fillStyle = "rgba(31,35,41,0.5)";
      ctx.font = "500 18px 'Plus Jakarta Sans', 'Segoe UI', sans-serif";
      ctx.fillText(`Built on ${appName}`, 140, canvas.height - 140);

      const blob = await canvasToBlob(canvas);
      const filename = "relationship-dna.png";

      const canNativeShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
      if (canNativeShare) {
        try {
          const file = new File([blob], filename, { type: "image/png" });
          const sharePayload = {
            files: [file],
            title: "My Relationship DNA",
            text: `Built on ${appName}`
          };
          if (!("canShare" in navigator) || navigator.canShare(sharePayload)) {
            await navigator.share(sharePayload);
            setMessage("Snapshot shared.");
            trackUxEvent("results_snapshot_shared_native");
            return;
          }
        } catch {
          // Fallback to download below.
        }
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Snapshot downloaded.");
      trackUxEvent("results_snapshot_downloaded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not share snapshot.");
      trackUxEvent("results_snapshot_share_failed");
    } finally {
      setIsWorking(false);
    }
  }

  return (
    <div className="actions">
      <button type="button" onClick={() => void handleShare()} disabled={isWorking}>
        {isWorking ? "Preparing image..." : "Share Snapshot"}
      </button>
      {message ? <p className="muted small">{message}</p> : null}
    </div>
  );
}
