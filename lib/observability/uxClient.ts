type UxPrimitive = string | number | boolean | null;
export type UxPayload = Record<string, UxPrimitive>;

type UxEvent = {
  event: string;
  context?: UxPayload;
  path: string;
  timestamp: string;
};

function isTelemetryEnabled(): boolean {
  const value = process.env.NEXT_PUBLIC_UX_TELEMETRY_ENABLED;
  if (!value) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return true;
}

function toUxEvent(event: string, context?: UxPayload): UxEvent {
  return {
    event,
    context,
    path: typeof window !== "undefined" ? window.location.pathname : "",
    timestamp: new Date().toISOString()
  };
}

export function trackUxEvent(event: string, context?: UxPayload): void {
  if (!event || !isTelemetryEnabled() || typeof window === "undefined") {
    return;
  }

  const payload = JSON.stringify(toUxEvent(event, context));

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/api/telemetry/ux", blob);
      return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch("/api/telemetry/ux", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => undefined);
}
