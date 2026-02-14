import { describe, expect, it, vi } from "vitest";

const { cookieSetMock, createServerClientMock } = vi.hoisted(() => ({
  cookieSetMock: vi.fn(() => {
    throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
  }),
  createServerClientMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: cookieSetMock
  }))
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseUrl: vi.fn(() => "https://example.supabase.co"),
  getSupabaseAnonKey: vi.fn(() => "anon")
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: createServerClientMock
}));

import { createServerSupabaseClient } from "@/lib/supabase/server";

describe("createServerSupabaseClient", () => {
  it("does not throw when cookie mutation is unavailable", async () => {
    createServerClientMock.mockImplementation((_url, _key, options) => {
      options.cookies.setAll([
        {
          name: "sb-demo-auth-token",
          value: "token",
          options: { path: "/" }
        }
      ]);
      return {};
    });

    await expect(createServerSupabaseClient()).resolves.toEqual({});
  });
});
