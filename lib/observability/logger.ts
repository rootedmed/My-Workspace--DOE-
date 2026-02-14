type LogLevel = "info" | "warn" | "error";

type LogFields = Record<string, string | number | boolean | null | undefined>;

function clean(fields: LogFields): Record<string, string | number | boolean | null> {
  const next: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function getRequestId(request: Request): string {
  const headerId = request.headers.get("x-request-id");
  if (headerId && headerId.trim().length > 0) {
    return headerId.trim();
  }
  return crypto.randomUUID();
}

export function logStructured(level: LogLevel, event: string, fields: LogFields): void {
  const payload = JSON.stringify({
    level,
    event,
    timestamp: new Date().toISOString(),
    ...clean(fields)
  });

  if (level === "error") {
    console.error(payload);
    return;
  }
  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.info(payload);
}
