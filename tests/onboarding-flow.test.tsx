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
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      if (url === "/api/onboarding/progress" && !init?.method) {
        return new Response(
          JSON.stringify({
            progress: { current_step: 1, completed: false, total_steps: 3, mode: "fast" },
            draft: {}
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (url === "/api/onboarding/profile" && !init?.method) {
        return new Response(
          JSON.stringify({
            profile: null,
            tendenciesSummary: []
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      if (url === "/api/photos" && !init?.method) {
        return new Response(JSON.stringify({ photos: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "/api/discover" && !init?.method) {
        return new Response(JSON.stringify({ candidates: [], emptyReason: "No candidates yet." }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "/api/onboarding/answer" && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      if (url === "/api/matches/preview" && !init?.method) {
        return new Response(JSON.stringify({ userId: "user-1", matches: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response(
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
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingFlow userId="user-1" />);

    await waitFor(() => expect(screen.queryByText("Loading profile...")).not.toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Maya" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Continue" })).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByLabelText("What are you looking for?")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(screen.getByLabelText(/Preferred commitment timeline \(months\)/i)).toBeInTheDocument());

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
