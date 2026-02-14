import { describe, expect, it } from "vitest";
import { resolveDatabaseClient } from "@/lib/db/client";

describe("database client mode guard", () => {
  it("throws in production when Supabase env vars are missing", () => {
    expect(() =>
      resolveDatabaseClient({
        NODE_ENV: "production",
        APP_ENCRYPTION_KEY: "",
        SUPABASE_URL: "",
        SUPABASE_ANON_KEY: ""
      })
    ).toThrow(/Invalid server environment: missing/);
  });

  it("allows local fallback in test mode", async () => {
    const client = resolveDatabaseClient({
      NODE_ENV: "test",
      SUPABASE_URL: "",
      SUPABASE_ANON_KEY: ""
    });

    await expect(client.ping()).resolves.toBe("ok");
  });
});
