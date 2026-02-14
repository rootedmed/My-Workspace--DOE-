"use client";

const CSRF_COOKIE = "cm_csrf";
const CSRF_HEADER = "x-csrf-token";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) {
    return null;
  }
  return decodeURIComponent(cookie.slice(prefix.length));
}

export async function getCsrfToken(): Promise<string> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) {
    return existing;
  }

  const response = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error("Unable to initialize CSRF token");
  }
  const payload = (await response.json()) as { csrfToken?: string };
  if (!payload.csrfToken) {
    throw new Error("Missing CSRF token");
  }
  return payload.csrfToken;
}

export async function withCsrfHeaders(
  base: Record<string, string> = {}
): Promise<Record<string, string>> {
  const token = await getCsrfToken();
  return {
    ...base,
    [CSRF_HEADER]: token
  };
}
