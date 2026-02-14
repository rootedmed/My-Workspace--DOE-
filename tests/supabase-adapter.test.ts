import { describe, expect, it } from "vitest";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";

describe("supabase config", () => {
  it("prefers server env vars when present", () => {
    process.env.SUPABASE_URL = "https://demo.supabase.co";
    process.env.SUPABASE_ANON_KEY = "anon-server";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-public";

    expect(getSupabaseUrl()).toBe("https://demo.supabase.co");
    expect(getSupabaseAnonKey()).toBe("anon-server");
  });

  it("falls back to NEXT_PUBLIC vars for browser contexts", () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://public.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-public";

    expect(getSupabaseUrl()).toBe("https://public.supabase.co");
    expect(getSupabaseAnonKey()).toBe("anon-public");
  });
});
