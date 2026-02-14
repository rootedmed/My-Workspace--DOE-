import crypto from "node:crypto";

export const CSRF_COOKIE = "cm_csrf";
export const CSRF_HEADER = "x-csrf-token";

function parseCookieHeader(cookieHeader: string | null): Map<string, string> {
  const parsed = new Map<string, string>();
  if (!cookieHeader) {
    return parsed;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    const value = rest.join("=");
    if (!rawName || !value) {
      continue;
    }
    parsed.set(rawName, decodeURIComponent(value));
  }

  return parsed;
}

export function createCsrfToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function getCsrfCookieFromRequest(request: Request): string | null {
  const parsed = parseCookieHeader(request.headers.get("cookie"));
  return parsed.get(CSRF_COOKIE) ?? null;
}

export function isValidCsrf(request: Request): boolean {
  const cookieToken = getCsrfCookieFromRequest(request);
  const headerToken = request.headers.get(CSRF_HEADER);
  if (!cookieToken || !headerToken) {
    return false;
  }
  return cookieToken.length >= 20 && cookieToken === headerToken;
}
