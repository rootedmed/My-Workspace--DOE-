import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/lib/auth/ensureAppUser", () => ({
  ensureAppUser: vi.fn(async () => undefined)
}));

vi.mock("@/lib/config/env.server", () => ({
  assertWriteAllowed: vi.fn(() => undefined)
}));

vi.mock("@/lib/security/rateLimit", () => ({
  applyRateLimit: vi.fn(() => ({ allowed: true, retryAfterSeconds: 0 })),
  getRequestIp: vi.fn(() => "127.0.0.1")
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: (table: string) => ({
      upsert: () => ({
        select: () => ({
          single: async () =>
            table === "onboarding_profiles"
              ? { data: { user_id: "user-1" }, error: null }
              : {
                  data: { current_step: 8, completed: true, total_steps: 8, mode: "deep" },
                  error: null
                }
        })
      })
    })
  }))
}));

import { POST } from "@/app/api/onboarding/complete/route";

describe("POST /api/onboarding/complete", () => {
  it("saves v2 profile and returns progress", async () => {
    const request = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        past_attribution: "conflict_comm",
        conflict_speed: 3,
        love_expression: ["time", "words"],
        support_need: "validation",
        emotional_openness: 2,
        relationship_vision: "friendship",
        relational_strengths: ["consistency", "honesty"],
        growth_intention: "alignment"
      })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.profile.growth_intention).toBe("alignment");
    expect(payload.progress.completed).toBe(true);
  });
});
