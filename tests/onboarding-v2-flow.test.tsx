import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "@/app/onboarding/OnboardingFlow";

const { pushMock, refreshMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  refreshMock: vi.fn()
}));

vi.mock("@/components/auth/csrf", () => ({
  withCsrfHeaders: vi.fn(async (base: Record<string, string> = {}) => ({
    ...base,
    "x-csrf-token": "csrf-test-token"
  }))
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock })
}));

afterEach(() => {
  vi.unstubAllGlobals();
  pushMock.mockReset();
  refreshMock.mockReset();
});

describe("OnboardingFlow Lucy", () => {
  it("loads session and advances when user sends a message", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);

      if (url === "/api/onboarding/lucy/session" && !init?.method) {
        return new Response(
          JSON.stringify({
            session: {
              currentStage: "opening",
              progress: { stage_number: 0, total_stages: 8, stage_label: "Opening", percent: 0 },
              messages: [
                {
                  id: "m1",
                  role: "assistant",
                  content: "I’m Lucy. Ready to start?",
                  created_at: new Date().toISOString(),
                  stage_id: "opening"
                }
              ],
              stageStates: {},
              controlFlags: {
                used_quick_mode: false,
                needs_manual_review: false,
                safety_flag: false,
                contradiction_flag: false,
                api_retry_count: 0
              },
              quickMode: false,
              completed: false,
              requiredAnswers: {},
              promptOptions: [],
              canSubmit: false
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/onboarding/lucy/message" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            session: {
              currentStage: "past_attribution",
              progress: { stage_number: 1, total_stages: 8, stage_label: "Past Reflection", percent: 10 },
              messages: [
                {
                  id: "m1",
                  role: "assistant",
                  content: "I’m Lucy. Ready to start?",
                  created_at: new Date().toISOString(),
                  stage_id: "opening"
                },
                {
                  id: "m2",
                  role: "user",
                  content: "yes",
                  created_at: new Date().toISOString(),
                  stage_id: "opening"
                },
                {
                  id: "m3",
                  role: "assistant",
                  content: "Perfect. First, I want to understand what you learned from your last relationship.",
                  created_at: new Date().toISOString(),
                  stage_id: "past_attribution"
                }
              ],
              stageStates: {},
              controlFlags: {
                used_quick_mode: false,
                needs_manual_review: false,
                safety_flag: false,
                contradiction_flag: false,
                api_retry_count: 0
              },
              quickMode: false,
              completed: false,
              requiredAnswers: {},
              promptOptions: [],
              canSubmit: false
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingFlow userId="user-1" />);
    await waitFor(() => expect(screen.queryByText("Loading Lucy onboarding...")).not.toBeInTheDocument());

    expect(screen.getByText("I’m Lucy. Ready to start?")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Type your response..."), { target: { value: "yes" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByText(/understand what you learned from your last relationship/i)).toBeInTheDocument();
    });
  });

  it("shows free-mode done gating and sends finish action", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);

      if (url === "/api/onboarding/lucy/session" && !init?.method) {
        return new Response(
          JSON.stringify({
            session: {
              currentStage: "opening",
              progress: { stage_number: 0, total_stages: 8, stage_label: "Conversation", percent: 25 },
              messages: [
                {
                  id: "fm1",
                  role: "assistant",
                  content: "How are you feeling about dating right now?",
                  created_at: new Date().toISOString(),
                  stage_id: "opening"
                }
              ],
              stageStates: {},
              controlFlags: {
                used_quick_mode: false,
                needs_manual_review: false,
                safety_flag: false,
                contradiction_flag: false,
                api_retry_count: 0
              },
              quickMode: false,
              completed: false,
              requiredAnswers: {},
              promptOptions: [],
              canSubmit: false,
              freeMode: {
                enabled: true,
                doneEligible: false,
                doneMinTurns: 5,
                userTurnCount: 2,
                extractionPhase: "chat",
                missingFields: [],
                wrapNudgeEligible: false
              }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url === "/api/onboarding/lucy/message" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}")) as { action?: string };
        if (body.action === "finish") {
          return new Response(
            JSON.stringify({
              session: {
                currentStage: "opening",
                progress: { stage_number: 0, total_stages: 8, stage_label: "Conversation", percent: 90 },
                messages: [
                  {
                    id: "fm1",
                    role: "assistant",
                    content: "How are you feeling about dating right now?",
                    created_at: new Date().toISOString(),
                    stage_id: "opening"
                  },
                  {
                    id: "fm2",
                    role: "user",
                    content: "I want real consistency this time.",
                    created_at: new Date().toISOString(),
                    stage_id: "opening"
                  },
                  {
                    id: "fm3",
                    role: "assistant",
                    content:
                      "Quick follow-up before I run matches: I still need what support helps most. Keep it short and direct.",
                    created_at: new Date().toISOString(),
                    stage_id: "opening"
                  }
                ],
                stageStates: {},
                controlFlags: {
                  used_quick_mode: false,
                  needs_manual_review: false,
                  safety_flag: false,
                  contradiction_flag: false,
                  api_retry_count: 0
                },
                quickMode: false,
                completed: false,
                requiredAnswers: {},
                promptOptions: [],
                canSubmit: false,
                freeMode: {
                  enabled: true,
                  doneEligible: true,
                  doneMinTurns: 5,
                  userTurnCount: 5,
                  extractionPhase: "followup",
                  missingFields: ["support_need"],
                  wrapNudgeEligible: true
                }
              }
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        return new Response(
          JSON.stringify({
            session: {
              currentStage: "opening",
              progress: { stage_number: 0, total_stages: 8, stage_label: "Conversation", percent: 80 },
              messages: [
                {
                  id: "fm1",
                  role: "assistant",
                  content: "How are you feeling about dating right now?",
                  created_at: new Date().toISOString(),
                  stage_id: "opening"
                },
                {
                  id: "fm2",
                  role: "user",
                  content: "I want real consistency this time.",
                  created_at: new Date().toISOString(),
                  stage_id: "opening"
                },
                {
                  id: "fm3",
                  role: "assistant",
                  content: "That makes sense. What did you learn from your last relationship?",
                  created_at: new Date().toISOString(),
                  stage_id: "opening"
                }
              ],
              stageStates: {},
              controlFlags: {
                used_quick_mode: false,
                needs_manual_review: false,
                safety_flag: false,
                contradiction_flag: false,
                api_retry_count: 0
              },
              quickMode: false,
              completed: false,
              requiredAnswers: {},
              promptOptions: [],
              canSubmit: false,
              freeMode: {
                enabled: true,
                doneEligible: true,
                doneMinTurns: 5,
                userTurnCount: 5,
                extractionPhase: "chat",
                missingFields: [],
                coverageScore: 75,
                wrapNudgeEligible: true,
                lowSignalStreak: 0
              }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingFlow userId="user-1" />);
    await waitFor(() => expect(screen.queryByText("Loading Lucy onboarding...")).not.toBeInTheDocument());

    expect(screen.getByText(/Talk naturally\. When you’re ready, tap “I’m done”\./i)).toBeInTheDocument();
    const gatedDone = screen.getByRole("button", { name: "I’m done (2/5)" });
    expect(gatedDone).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Type your response..."), { target: { value: "I want real consistency this time." } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "I’m done" })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "I’m done" }));

    await waitFor(() => {
      expect(screen.getByText(/Quick follow-up before I run matches/i)).toBeInTheDocument();
    });

    const finishCall = fetchMock.mock.calls.find(([, init]) => {
      if (!init || init.method !== "POST") return false;
      return String(init.body ?? "").includes("\"finish\"");
    });
    expect(finishCall).toBeTruthy();
  });

  it("trims trailing whitespace in rendered chat bubbles", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);

      if (url === "/api/onboarding/lucy/session" && !init?.method) {
        return new Response(
          JSON.stringify({
            session: {
              currentStage: "opening",
              progress: { stage_number: 0, total_stages: 8, stage_label: "Conversation", percent: 10 },
              messages: [
                {
                  id: "trim-1",
                  role: "assistant",
                  content: "Hello there.\n\n   ",
                  created_at: new Date().toISOString(),
                  stage_id: "opening"
                }
              ],
              stageStates: {},
              controlFlags: {
                used_quick_mode: false,
                needs_manual_review: false,
                safety_flag: false,
                contradiction_flag: false,
                api_retry_count: 0
              },
              quickMode: false,
              completed: false,
              requiredAnswers: {},
              promptOptions: [],
              canSubmit: false,
              freeMode: {
                enabled: true,
                doneEligible: false,
                doneMinTurns: 5,
                userTurnCount: 0,
                extractionPhase: "chat",
                missingFields: []
              }
            }
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<OnboardingFlow userId="user-1" />);
    await waitFor(() => expect(screen.queryByText("Loading Lucy onboarding...")).not.toBeInTheDocument());

    const bubbleText = screen.getByText("Hello there.");
    expect(bubbleText.textContent).toBe("Hello there.");
  });
});
