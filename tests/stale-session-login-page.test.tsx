import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const {
  getUserFromAccessTokenMock,
  signOutAccessTokenMock,
  redirectMock,
  cookiesDeleteMock
} = vi.hoisted(() => ({
  getUserFromAccessTokenMock: vi.fn(),
  signOutAccessTokenMock: vi.fn(async () => undefined),
  redirectMock: vi.fn(),
  cookiesDeleteMock: vi.fn()
}));

vi.mock("@/lib/auth/supabaseAuth", () => ({
  getUserFromAccessToken: getUserFromAccessTokenMock,
  signOutAccessToken: signOutAccessTokenMock
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => [
      { name: "sb-demo-auth-token", value: "stale" },
      { name: "cm_csrf", value: "csrf" }
    ]),
    delete: cookiesDeleteMock
  }))
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: () => <div>Login form</div>
}));

import { getCurrentUser } from "@/lib/auth/session";
import LoginPage from "@/app/login/page";

describe("stale auth session handling", () => {
  it("returns null when JWT sub claim user is missing, and login page still renders", async () => {
    getUserFromAccessTokenMock.mockResolvedValue({
      user: null,
      errorCode: "user_not_found",
      errorMessage: "User from sub claim in JWT does not exist"
    });

    const currentUser = await getCurrentUser();
    expect(currentUser).toBeNull();
    expect(signOutAccessTokenMock).toHaveBeenCalledTimes(1);
    expect(cookiesDeleteMock).toHaveBeenCalledWith("sb-demo-auth-token");

    render(await LoginPage());
    expect(screen.getByText("Login form")).toBeInTheDocument();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
