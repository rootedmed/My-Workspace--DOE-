import { logStructured } from "@/lib/observability/logger";

type ErrorContext = {
  source: "server" | "edge";
  requestId?: string;
  route?: string;
  userId?: string;
};

export function captureObservedError(error: unknown, context: ErrorContext): void {
  const normalized = error instanceof Error ? error : new Error(String(error));

  logStructured("error", "observed_exception", {
    source: context.source,
    request_id: context.requestId,
    route: context.route,
    user_id: context.userId,
    error_name: normalized.name,
    error_message: normalized.message
  });

  const sinkUrl = process.env.OBSERVABILITY_WEBHOOK_URL;
  if (!sinkUrl) {
    return;
  }

  const body = JSON.stringify({
    source: context.source,
    request_id: context.requestId ?? null,
    route: context.route ?? null,
    user_id: context.userId ?? null,
    error_name: normalized.name,
    error_message: normalized.message,
    timestamp: new Date().toISOString()
  });

  void fetch(sinkUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  }).catch(() => undefined);
}
