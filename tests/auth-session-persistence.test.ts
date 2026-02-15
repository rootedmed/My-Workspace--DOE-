import { describe, expect, it, vi } from "vitest";

const { isValidCsrfMock, signInMock, getUserFromAccessTokenMock, upsertAuthUserMock } = vi.hoisted(() => ({
  isValidCsrfMock: vi.fn(() => true),
  signInMock: vi.fn(),
  getUserFromAccessTokenMock: vi.fn(),
  upsertAuthUserMock: vi.fn()
}));

vi.mock("@/lib/security/csrf", () => ({
  isValidCsrf: isValidCsrfMock
}));

vi.mock("@/lib/auth/supabaseAuth", () => ({
  signInWithPassword: signInMock,
  getUserFromAccessToken: getUserFromAccessTokenMock
}));

vi.mock("@/lib/auth/ensureAppUser", () => ({
  ensureAppUser: vi.fn(async () => undefined)
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    upsertAuthUser: upsertAuthUserMock
  }
}));

import { POST as loginPost } from "@/app/api/auth/login/route";
import { getCurrentUser } from "@/lib/auth/session";

describe("auth session persistence", () => {
  it("allows login then subsequent authenticated user resolution", async () => {
    const authUser = {
      id: "user-123",
      email: "maya@example.com",
      user_metadata: { firstName: "Maya" }
    };

    signInMock.mockResolvedValueOnce({
      user: authUser,
      access_token: "token",
      expires_in: 3600
    });
    getUserFromAccessTokenMock.mockResolvedValueOnce({
      user: authUser,
      errorCode: null,
      errorMessage: null
    });
    upsertAuthUserMock.mockImplementation(async (input: { id: string; email: string; firstName: string }) => ({
      id: input.id,
      email: input.email,
      firstName: input.firstName,
      createdAt: new Date().toISOString(),
      passwordHash: "external_auth",
      salt: "external_auth"
    }));

    const response = await loginPost(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "maya@example.com", password: "password123" })
      })
    );

    expect(response.status).toBe(200);

    const currentUser = await getCurrentUser();
    expect(currentUser?.id).toBe("user-123");
    expect(currentUser?.email).toBe("maya@example.com");
  });
});
