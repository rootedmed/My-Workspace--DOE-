import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/debug/supabase/route";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("GET /api/debug/supabase", () => {
  it("returns project ref and env booleans", async () => {
    process.env.SUPABASE_URL = "https://abcde12345.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcde12345.supabase.co";

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.projectRef).toBe("abcde12345");
    expect(payload.env.SUPABASE_URL).toBe(true);
    expect(payload.env.SUPABASE_ANON_KEY).toBe(true);
    expect(typeof payload.runtime).toBe("string");
  });
});
