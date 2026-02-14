import { describe, expect, it } from "vitest";
import { validateServerEnv } from "@/lib/config/env.server";

describe("validateServerEnv", () => {
  it("throws in preview when required vars are missing", () => {
    expect(() =>
      validateServerEnv({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        APP_ENCRYPTION_KEY: "",
        SUPABASE_URL: "",
        SUPABASE_ANON_KEY: ""
      })
    ).toThrow(/Invalid server environment: missing/);
  });

  it("accepts fully configured production env", () => {
    expect(() =>
      validateServerEnv({
        NODE_ENV: "production",
        APP_ENCRYPTION_KEY: "super-long-encryption-key",
        SUPABASE_URL: "https://demo.supabase.co",
        SUPABASE_ANON_KEY: "anon-key"
      })
    ).not.toThrow();
  });
});
