import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimitStore } from "@/lib/security/rateLimit";

const { signInWithPasswordMock, upsertAuthUserMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  upsertAuthUserMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    upsertAuthUser: upsertAuthUserMock
  }
}));

vi.mock("@/lib/auth/supabaseAuth", () => ({
  signInWithPassword: signInWithPasswordMock
}));

vi.mock("@/lib/security/csrf", () => ({
  isValidCsrf: vi.fn(() => true)
}));

import { POST } from "@/app/api/auth/login/route";

describe("login rate limiting", () => {
  beforeEach(() => {
    clearRateLimitStore();
    signInWithPasswordMock.mockReset();
    upsertAuthUserMock.mockReset();
    signInWithPasswordMock.mockRejectedValue(new Error("Auth request failed"));
  });

  it("returns 429 after repeated login attempts for the same ip/email", async () => {
    const init = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": "198.51.100.10"
      },
      body: JSON.stringify({ email: "user@example.com", password: "password123" })
    } satisfies RequestInit;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await POST(new Request("http://localhost/api/auth/login", init));
      expect(response.status).toBe(401);
    }

    const blocked = await POST(new Request("http://localhost/api/auth/login", init));
    const payload = await blocked.json();

    expect(blocked.status).toBe(429);
    expect(payload.error).toContain("Too many login attempts");
  });
});
