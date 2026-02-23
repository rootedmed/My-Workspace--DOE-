import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LucySessionState, LucySessionView } from "@/lib/onboarding/lucy/types";

const ensureLucySessionMock = vi.fn();
const saveLucySessionMock = vi.fn(async () => undefined);
const processFreeMock = vi.fn();
const enableFreeModeMock = vi.fn();
const processConversationalMock = vi.fn();
const processLegacyMock = vi.fn();
const switchQuickModeMock = vi.fn();
const buildLegacyViewMock = vi.fn();
const buildFreeViewMock = vi.fn();
const logStructuredMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "user-1",
    email: "maya@example.com",
    firstName: "Maya"
  }))
}));

vi.mock("@/lib/security/csrf", () => ({
  isValidCsrf: vi.fn(() => true)
}));

vi.mock("@/lib/security/rateLimit", () => ({
  applyRateLimit: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
  getRequestIp: vi.fn(() => "127.0.0.1")
}));

vi.mock("@/lib/config/env.server", () => ({
  assertWriteAllowed: vi.fn(() => undefined)
}));

vi.mock("@/lib/auth/ensureAppUser", () => ({
  ensureAppUser: vi.fn(async () => undefined)
}));

vi.mock("@/lib/onboarding/lucy/store", () => ({
  ensureLucySession: ensureLucySessionMock,
  saveLucySession: saveLucySessionMock
}));

vi.mock("@/lib/onboarding/lucy/freeConversationEngine", () => ({
  processLucyFreeConversationAction: processFreeMock,
  enableFreeConversationMode: enableFreeModeMock,
  buildLucySessionViewFree: buildFreeViewMock
}));

vi.mock("@/lib/onboarding/lucy/engine", () => ({
  buildLucySessionView: buildLegacyViewMock,
  processLucyUserMessage: processLegacyMock,
  switchLucyQuickMode: switchQuickModeMock
}));

vi.mock("@/lib/onboarding/lucy/conversationalEngine", () => ({
  processLucyUserMessageConversational: processConversationalMock
}));

vi.mock("@/lib/onboarding/lucy/freeMode", () => ({
  isLucyFreeConversationDevEnabled: () =>
    ["1", "true", "yes", "on"].includes((process.env.LUCY_FREE_CONVO_DEV_ENABLED ?? "").trim().toLowerCase())
}));

vi.mock("@/lib/observability/logger", () => ({
  logStructured: logStructuredMock
}));

function baseState(overrides: Partial<LucySessionState> = {}): LucySessionState {
  return {
    user_id: "user-1",
    session_id: "session-1",
    current_stage: "opening",
    stage_states: {} as LucySessionState["stage_states"],
    messages: [],
    extracted_data: {},
    extraction_envelopes: {},
    control_flags: {
      used_quick_mode: false,
      needs_manual_review: false,
      safety_flag: false,
      contradiction_flag: false,
      api_retry_count: 0,
      experiment_variant: "control_a",
      model_version: "model",
      prompt_version: "prompt"
    },
    off_topic_total: 0,
    off_topic_consecutive: 0,
    quick_mode: false,
    completed: false,
    last_prompt_id: null,
    last_user_message_id: null,
    started_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

function legacyView(): LucySessionView {
  return {
    currentStage: "opening",
    progress: { stage_number: 0, total_stages: 8, stage_label: "Opening", percent: 0 },
    messages: [],
    stageStates: {} as LucySessionView["stageStates"],
    controlFlags: {
      used_quick_mode: false,
      needs_manual_review: false,
      safety_flag: false,
      contradiction_flag: false,
      api_retry_count: 0,
      experiment_variant: "control_a",
      model_version: "model",
      prompt_version: "prompt"
    },
    quickMode: false,
    completed: false,
    requiredAnswers: {},
    promptOptions: [],
    canSubmit: false
  };
}

function freeView(): LucySessionView {
  return {
    ...legacyView(),
    freeMode: {
      enabled: true,
      doneEligible: true,
      doneMinTurns: 5,
      userTurnCount: 5,
      extractionPhase: "chat",
      missingFields: [],
      coverageScore: 75
    }
  };
}

describe("POST /api/onboarding/lucy/message (free mode routing)", () => {
  beforeEach(() => {
    vi.resetModules();
    ensureLucySessionMock.mockReset();
    saveLucySessionMock.mockClear();
    processFreeMock.mockReset();
    enableFreeModeMock.mockReset();
    processConversationalMock.mockReset();
    processLegacyMock.mockReset();
    switchQuickModeMock.mockReset();
    buildLegacyViewMock.mockReset();
    buildFreeViewMock.mockReset();
    logStructuredMock.mockReset();
    delete process.env.LUCY_FREE_CONVO_DEV_ENABLED;
  });

  it("routes to free conversation engine when dev flag is enabled", async () => {
    process.env.LUCY_FREE_CONVO_DEV_ENABLED = "true";
    const existing = baseState();
    const enabled = baseState({
      control_flags: {
        ...existing.control_flags,
        free_conversation_mode: true,
        free_extraction_phase: "chat",
        free_prompt_guard_hits: 0,
        free_prompt_guard_reason: "none",
        free_gemini_status: "none",
        free_gemini_http_status: undefined,
        free_gemini_finish_reason: undefined,
        free_gemini_block_reason: undefined,
        free_gemini_error_code: undefined
      }
    });
    const next = baseState({
      control_flags: {
        ...enabled.control_flags,
        free_conversation_mode: true,
        free_extraction_phase: "chat",
        free_prompt_guard_hits: 1,
        free_prompt_guard_reason: "vague",
        free_gemini_status: "continued_ok",
        free_gemini_http_status: 200,
        free_gemini_finish_reason: "STOP",
        free_gemini_block_reason: undefined,
        free_gemini_error_code: undefined
      }
    });
    ensureLucySessionMock.mockResolvedValueOnce(existing);
    enableFreeModeMock.mockReturnValueOnce(enabled);
    processFreeMock.mockResolvedValueOnce(next);
    buildFreeViewMock.mockReturnValue(freeView());

    const { POST } = await import("@/app/api/onboarding/lucy/message/route");
    const response = await POST(
      new Request("http://localhost/api/onboarding/lucy/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "finish",
          message: ""
        })
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(processFreeMock).toHaveBeenCalledTimes(1);
    expect(processFreeMock.mock.calls[0]?.[1]).toMatchObject({ action: "finish" });
    expect(processConversationalMock).not.toHaveBeenCalled();
    expect(processLegacyMock).not.toHaveBeenCalled();
    expect(payload.session.freeMode.enabled).toBe(true);
    expect(logStructuredMock).toHaveBeenCalledWith(
      "info",
      "lucy_free_turn_processed",
      expect.objectContaining({
        extraction_phase: "chat",
        turn_number: 0,
        provider_used: "none",
        gemini_status: "continued_ok",
        gemini_http_status: 200,
        gemini_finish_reason: "STOP",
        gemini_block_reason: null,
        gemini_error_code: null
      })
    );
    expect(logStructuredMock).not.toHaveBeenCalledWith("info", "lucy_free_prompt_guard_triggered", expect.any(Object));
  });

  it("falls back to legacy conversational routing when free mode flag is disabled", async () => {
    process.env.LUCY_FREE_CONVO_DEV_ENABLED = "false";
    const existing = baseState({
      control_flags: {
        ...baseState().control_flags,
        experiment_variant: "treatment_b"
      }
    });
    const next = baseState();
    ensureLucySessionMock.mockResolvedValueOnce(existing);
    processConversationalMock.mockResolvedValueOnce(next);
    buildLegacyViewMock.mockReturnValueOnce(legacyView());

    const { POST } = await import("@/app/api/onboarding/lucy/message/route");
    const response = await POST(
      new Request("http://localhost/api/onboarding/lucy/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          message: "hello"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(processFreeMock).not.toHaveBeenCalled();
    expect(processConversationalMock).toHaveBeenCalledTimes(1);
  });
});
