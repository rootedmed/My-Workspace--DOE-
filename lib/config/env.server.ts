type EnvLike = {
  APP_ENCRYPTION_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  ALLOW_LOCAL_FALLBACK?: string;
  APP_PREVIEW_READ_ONLY?: string;
};

export function isStrictRuntime(env: EnvLike = process.env): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "preview";
}

export function isPreviewReadOnly(env: EnvLike = process.env): boolean {
  return env.VERCEL_ENV === "preview" && env.APP_PREVIEW_READ_ONLY === "true";
}

export function assertWriteAllowed(env: EnvLike = process.env): void {
  if (isPreviewReadOnly(env)) {
    throw new Error("Preview deployment is configured as read-only.");
  }
}

export function validateServerEnv(env: EnvLike = process.env): void {
  if (!isStrictRuntime(env)) {
    return;
  }

  const required = [
    "APP_ENCRYPTION_KEY",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY"
  ] as const;
  const missing = required.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim().length === 0;
  });

  if (missing.length > 0) {
    throw new Error(`Invalid server environment: missing ${missing.join(", ")}.`);
  }

  const weak: string[] = [];
  if ((env.APP_ENCRYPTION_KEY ?? "").includes("change-this")) {
    weak.push("APP_ENCRYPTION_KEY");
  }

  if (weak.length > 0) {
    throw new Error(`Invalid server environment: weak placeholder values for ${weak.join(", ")}.`);
  }
}
