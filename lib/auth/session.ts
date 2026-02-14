import { cookies } from "next/headers";
import { getUserFromAccessToken, signOutAccessToken } from "@/lib/auth/supabaseAuth";

const STALE_AUTH_ERROR_CODES = new Set(["user_not_found"]);
const STALE_AUTH_ERROR_MESSAGE_HINTS = ["User from sub claim in JWT does not exist"];

function isStaleSessionError(code: string | null, message: string | null): boolean {
  if (code && STALE_AUTH_ERROR_CODES.has(code)) {
    return true;
  }
  if (!message) {
    return false;
  }
  return STALE_AUTH_ERROR_MESSAGE_HINTS.some((hint) => message.includes(hint));
}

function logStaleSessionError(code: string | null, message: string | null): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  console.warn("[auth] stale session detected; clearing auth cookies", {
    code: code ?? "unknown",
    message: message ?? "unknown"
  });
}

async function clearSupabaseAuthCookies() {
  const cookieStore = await cookies();
  const authCookies = cookieStore
    .getAll()
    .map((cookie) => cookie.name)
    .filter((name) => name.startsWith("sb-"));

  for (const cookieName of authCookies) {
    try {
      cookieStore.delete(cookieName);
    } catch {
      // Ignore cookie mutation failures in non-mutable request contexts.
    }
  }
}

export async function getCurrentUser() {
  const authLookup = await getUserFromAccessToken().catch(() => ({
    user: null,
    errorCode: "auth_lookup_failed",
    errorMessage: "Unable to resolve Supabase auth user"
  }));
  const authUser = authLookup.user;
  if (!authUser?.id || !authUser.email) {
    if (isStaleSessionError(authLookup.errorCode, authLookup.errorMessage)) {
      logStaleSessionError(authLookup.errorCode, authLookup.errorMessage);
      await signOutAccessToken().catch(() => undefined);
      await clearSupabaseAuthCookies();
    }
    return null;
  }

  const firstName =
    authUser.user_metadata?.firstName ??
    authUser.user_metadata?.first_name ??
    authUser.email.split("@")[0] ??
    "Member";

  return {
    id: authUser.id,
    email: authUser.email,
    firstName
  };
}
