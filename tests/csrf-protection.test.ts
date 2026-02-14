import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearRateLimitStore } from "@/lib/security/rateLimit";

const { signInWithPasswordMock, upsertAuthUserMock, getCurrentUserMock } = vi.hoisted(() => ({
  signInWithPasswordMock: vi.fn(),
  upsertAuthUserMock: vi.fn(),
  getCurrentUserMock: vi.fn()
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    upsertAuthUser: upsertAuthUserMock
  }
}));

vi.mock("@/lib/auth/supabaseAuth", () => ({
  signInWithPassword: signInWithPasswordMock
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as onboardingPost } from "@/app/api/onboarding/complete/route";

describe("CSRF protection", () => {
  beforeEach(() => {
    clearRateLimitStore();
    signInWithPasswordMock.mockReset();
    upsertAuthUserMock.mockReset();
    getCurrentUserMock.mockReset();
  });

  it("rejects login POST without CSRF token", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@example.com", password: "password123" })
    });

    const response = await loginPost(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("CSRF");
  });

  it("rejects onboarding submit POST without CSRF token", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1" });
    const request = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const response = await onboardingPost(request);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toContain("CSRF");
  });
});
