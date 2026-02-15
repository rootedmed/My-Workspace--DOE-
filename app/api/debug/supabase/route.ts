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

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const projectRef = extractProjectRef(supabaseUrl);

  return NextResponse.json(
    {
      projectRef,
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
