import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { redirectMock, getCurrentUserMock, getProfileMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
  getCurrentUserMock: vi.fn(),
  getProfileMock: vi.fn()
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    getProfile: getProfileMock
  }
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
    getProfileMock.mockResolvedValueOnce(null);

    await expect(ResultsPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(redirectMock).toHaveBeenCalledWith("/app");
  });

  it("renders trait cards and discover CTA", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1", email: "maya@example.com", firstName: "Maya" });
    getProfileMock.mockResolvedValueOnce({
      id: "user-1",
      firstName: "Maya",
      ageRange: "31_37",
      locationPreference: "same_city",
      intent: {
        lookingFor: "serious_relationship",
        timelineMonths: 14,
        readiness: 4,
        weeklyCapacity: 3
      },
      tendencies: {
        attachmentAnxiety: 52,
        attachmentAvoidance: 40,
        conflictRepair: 64,
        emotionalRegulation: 60,
        noveltyPreference: 45
      },
      personality: {
        openness: 55,
        conscientiousness: 58,
        extraversion: 62,
        agreeableness: 57,
        emotionalStability: 59
      },
      createdAt: new Date().toISOString()
    });

    render(await ResultsPage());

    expect(screen.getByRole("heading", { name: "Here's your relationship style" })).toBeInTheDocument();
    expect(screen.getByText("Emotional Pace")).toBeInTheDocument();
    expect(screen.getByText("Conflict Style")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See compatible matches" })).toHaveAttribute("href", "/discover");
  });
});
