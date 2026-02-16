import { NextResponse } from "next/server";

function extractProjectRef(url: string | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (!host.endsWith(".supabase.co")) {
      return null;
    }
    return host.split(".")[0] ?? null;
  } catch {
    return null;
  }
}

function decodeJwtRef(token: string | undefined): string | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = Buffer.from(parts[1] ?? "", "base64url").toString("utf8");
    const parsed = JSON.parse(payload) as { ref?: string };
    return parsed.ref ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = extractProjectRef(supabaseUrl);
  const serverAnonKey = process.env.SUPABASE_ANON_KEY;
  const publicAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const effectiveAnonKey = serverAnonKey ?? publicAnonKey;

  const serverAnonKeyProjectRef = decodeJwtRef(serverAnonKey);
  const publicAnonKeyProjectRef = decodeJwtRef(publicAnonKey);
  const effectiveAnonKeyProjectRef = decodeJwtRef(effectiveAnonKey);

  let healthReachable: boolean | null = null;
  if (supabaseUrl) {
    try {
      const response = await fetch(`${supabaseUrl}/auth/v1/health`, { method: "GET", cache: "no-store" });
      healthReachable = response.ok;
    } catch {
      healthReachable = false;
    }
  }

  return NextResponse.json(
    {
      projectRef,
      healthReachable,
      effectiveAnonKeyProjectRef,
      effectiveAnonKeyLooksValid: Boolean(effectiveAnonKeyProjectRef),
      effectiveAnonKeyMatchesUrl:
        projectRef !== null && effectiveAnonKeyProjectRef !== null ? projectRef === effectiveAnonKeyProjectRef : null,
      serverAnonKeyProjectRef,
      serverAnonKeyLooksValid: Boolean(serverAnonKeyProjectRef),
      serverAnonKeyMatchesUrl:
        projectRef !== null && serverAnonKeyProjectRef !== null ? projectRef === serverAnonKeyProjectRef : null,
      publicAnonKeyProjectRef,
      publicAnonKeyLooksValid: Boolean(publicAnonKeyProjectRef),
      publicAnonKeyMatchesUrl:
        projectRef !== null && publicAnonKeyProjectRef !== null ? projectRef === publicAnonKeyProjectRef : null,
      runtime: process.env.VERCEL ? "vercel" : "local",
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      env: {
        SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
        SUPABASE_ANON_KEY: Boolean(process.env.SUPABASE_ANON_KEY),
        NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
        APP_ENCRYPTION_KEY: Boolean(process.env.APP_ENCRYPTION_KEY),
        ALLOW_LOCAL_FALLBACK: Boolean(process.env.ALLOW_LOCAL_FALLBACK)
      }
    },
    { status: 200 }
  );
}
