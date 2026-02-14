import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "@/components/OnboardingFlow";

vi.mock("@/components/auth/csrf", () => ({
  withCsrfHeaders: vi.fn(async (base: Record<string, string> = {}) => ({
    ...base,
    "x-csrf-token": "csrf-test-token"
  }))
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OnboardingFlow", () => {
  it("submits onboarding payload to save endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          profile: {
            id: "user-1",
            firstName: "Maya",
            ageRange: "31_37",
            locationPreference: "same_city",
            intent: {
              lookingFor: "marriage_minded",
              timelineMonths: 18,
              readiness: 4,
              weeklyCapacity: 2
            },
            tendencies: {
              attachmentAnxiety: 50,
              attachmentAvoidance: 50,
              conflictRepair: 50,
              emotionalRegulation: 50,
              noveltyPreference: 50
            },
            personality: {
              openness: 50,
              conscientiousness: 50,
              extraversion: 50,
              agreeableness: 50,
              emotionalStability: 50
            },
            createdAt: new Date().toISOString()
          },
          tendenciesSummary: ["You report strong repair habits after conflict."]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingFlow userId="user-1" />);

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Maya" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    fireEvent.click(screen.getByRole("button", { name: "Save onboarding" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/onboarding/complete",
        expect.objectContaining({
          method: "POST"
        })
      );
    });
  });
});
