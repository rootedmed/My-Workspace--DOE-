import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { redirectMock, getCurrentUserMock, getOnboardingV2StateMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  getOnboardingV2StateMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

vi.mock("@/lib/onboarding/v2", () => ({
  getOnboardingV2State: getOnboardingV2StateMock
}));

import ResultsPage from "@/app/results/page";

describe("ResultsPage", () => {
  it("redirects to login when unauthenticated", async () => {
    redirectMock.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });
    getCurrentUserMock.mockResolvedValueOnce(null);

    await expect(ResultsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/login");
  });

  it("redirects to onboarding when profile is missing", async () => {
    redirectMock.mockImplementationOnce(() => {
      throw new Error("NEXT_REDIRECT");
    });
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1", email: "maya@example.com", firstName: "Maya" });
    getOnboardingV2StateMock.mockResolvedValueOnce({
      hasProfile: false,
      compatibilityProfile: null,
      completedAt: null,
      readinessScore: null,
      attachmentAxis: null
    });

    await expect(ResultsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/onboarding");
  });

  it("renders relationship DNA snapshot and discover CTA", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1", email: "maya@example.com", firstName: "Maya" });
    getOnboardingV2StateMock.mockResolvedValueOnce({
      hasProfile: true,
      compatibilityProfile: {
        conflict_speed: 3,
        love_expression: ["time", "acts"],
        relationship_vision: "friendship",
      },
      completedAt: new Date().toISOString(),
      readinessScore: 72,
      attachmentAxis: "secure"
    });

    render(await ResultsPage());

    expect(screen.getByRole("heading", { name: "Your relationship DNA" })).toBeInTheDocument();
    expect(screen.getByText("Attachment Style")).toBeInTheDocument();
    expect(screen.getByText("Conflict Style")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See compatible matches" })).toHaveAttribute("href", "/discover");
  });
});
