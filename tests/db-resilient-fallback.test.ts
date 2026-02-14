import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        limit: async () => ({
          error: { message: "relation \"app_users\" does not exist" }
        })
      })
    })
  }))
}));

import { resolveDatabaseClient } from "@/lib/db/client";

describe("resilient database fallback", () => {
  it("falls back to local encrypted store in development when Supabase queries fail", async () => {
    const client = resolveDatabaseClient({
      NODE_ENV: "development",
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_ANON_KEY: "anon-key"
    });

    await expect(client.ping()).resolves.toBe("ok");
  });
});
