import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "@/components/OnboardingFlow";

const { pushMock } = vi.hoisted(() => ({
  pushMock: vi.fn()
}));

vi.mock("@/components/auth/csrf", () => ({
  withCsrfHeaders: vi.fn(async (base: Record<string, string> = {}) => ({
    ...base,
    "x-csrf-token": "csrf-test-token"
  }))
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

afterEach(() => {
  vi.unstubAllGlobals();
  pushMock.mockReset();
});

describe("OnboardingFlow", () => {
  it("submits onboarding payload and routes to results", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      if (url === "/api/onboarding/progress" && !init?.method) {
        return new Response(
          JSON.stringify({
            progress: { current_step: 1, completed: false, total_steps: 7, mode: "deep" },
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

      if (url === "/api/onboarding/progress" && init?.method === "POST") {
        return new Response(JSON.stringify({ ok: true }), {
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

    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("When tension comes up, what feels most like you?")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Direct then repair" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("How much reassurance do you want during uncertainty?")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "3" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Which attachment style feels closest to your default?")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Secure" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("How social do you feel most weeks?")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "4" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("What rhythm best matches your lifestyle?")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("How often do you reflect and adjust your relationship patterns?")).toBeInTheDocument());

    const fourButtons = screen.getAllByRole("button", { name: "4" });
    fireEvent.click(fourButtons[fourButtons.length - 1]!);
    fireEvent.click(screen.getByRole("button", { name: "See results" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/onboarding/complete",
        expect.objectContaining({
          method: "POST"
        })
      );
    });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/results");
    });
  });

  it("guards double submit and does not skip questions on spam click", async () => {
    let answerCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      if (url === "/api/onboarding/progress" && !init?.method) {
        return new Response(
          JSON.stringify({
            progress: { current_step: 1, completed: false, total_steps: 7, mode: "deep" },
            draft: {}
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url === "/api/onboarding/profile" && !init?.method) {
        return new Response(JSON.stringify({ profile: null, tendenciesSummary: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "/api/photos" && !init?.method) {
        return new Response(JSON.stringify({ photos: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "/api/discover" && !init?.method) {
        return new Response(JSON.stringify({ candidates: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "/api/onboarding/answer" && init?.method === "POST") {
        answerCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingFlow userId="user-1" />);
    await waitFor(() => expect(screen.queryByText("Loading profile...")).not.toBeInTheDocument());

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));

    const next = screen.getByRole("button", { name: "Next" });
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(next);

    await waitFor(() => expect(screen.getByText("When tension comes up, what feels most like you?")).toBeInTheDocument());
    expect(answerCalls).toBe(1);
  });

  it("opens onboarding editor from Me for completed profiles", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      if (url === "/api/onboarding/progress" && !init?.method) {
        return new Response(
          JSON.stringify({
            progress: { current_step: 7, completed: true, total_steps: 7, mode: "deep" },
            draft: {
              emotional_pacing: "steady",
              conflict_approach: "direct_repair",
              reassurance_needs: "3",
              attachment_leaning: "secure",
              social_energy: "4",
              lifestyle_rhythms: "balanced",
              past_pattern_reflection: "4"
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url === "/api/onboarding/profile" && !init?.method) {
        return new Response(
          JSON.stringify({
            profile: {
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
                attachmentAnxiety: 50,
                attachmentAvoidance: 40,
                conflictRepair: 60,
                emotionalRegulation: 60,
                noveltyPreference: 50
              },
              personality: {
                openness: 50,
                conscientiousness: 50,
                extraversion: 60,
                agreeableness: 50,
                emotionalStability: 60
              },
              createdAt: new Date().toISOString()
            },
            tendenciesSummary: []
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url === "/api/photos" && !init?.method) {
        return new Response(JSON.stringify({ photos: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url === "/api/discover" && !init?.method) {
        return new Response(JSON.stringify({ candidates: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingFlow userId="user-1" />);
    await waitFor(() => expect(screen.queryByText("Loading profile...")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Me" }));
    await waitFor(() => expect(screen.getByText("Analysis answers")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Edit Dating Style Analysis" }));

    await waitFor(() => {
      expect(screen.getByText("How often do you reflect and adjust your relationship patterns?")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Update results" })).toBeInTheDocument();
  });
});
