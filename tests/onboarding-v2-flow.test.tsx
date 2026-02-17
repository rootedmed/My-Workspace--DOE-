import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "@/app/onboarding/OnboardingFlow";

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

describe("OnboardingFlow v2", () => {
  it("disables continue until answered and advances one step", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      if (url === "/api/onboarding/progress" && !init?.method) {
        return new Response(
          JSON.stringify({
            progress: { current_step: 1, completed: false, total_steps: 8, mode: "deep" },
            draft: {}
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (url === "/api/onboarding/answer" && init?.method === "POST") {
        return new Response(JSON.stringify({ progress: { current_step: 2 } }), {
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
    await waitFor(() => expect(screen.queryByText("Loading onboarding...")).not.toBeInTheDocument());

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /Different directions/i }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() => {
      expect(screen.getByText("In a disagreement with someone you love, what do you tend to do first?")).toBeInTheDocument();
    });
  });
});
