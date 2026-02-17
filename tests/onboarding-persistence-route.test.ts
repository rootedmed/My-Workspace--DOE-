import { describe, expect, it, vi } from "vitest";

let savedRow: {
  compatibility_profile: Record<string, unknown> | null;
  attachment_axis: string | null;
  readiness_score: number | null;
  completed_at: string | null;
} | null = null;

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

vi.mock("@/lib/db/client", () => ({
  db: {}
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: (table: string) => ({
      upsert: (payload: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (table === "onboarding_profiles") {
              savedRow = {
                compatibility_profile: (payload.compatibility_profile as Record<string, unknown>) ?? null,
                attachment_axis: typeof payload.attachment_axis === "string" ? payload.attachment_axis : null,
                readiness_score: typeof payload.readiness_score === "number" ? payload.readiness_score : null,
                completed_at: typeof payload.completed_at === "string" ? payload.completed_at : null
              };
              return { data: { user_id: "user-1" }, error: null };
            }
            return {
              data: { current_step: 8, completed: true, total_steps: 8, mode: "deep" },
              error: null
            };
          }
        })
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: savedRow, error: null })
        })
      })
    })
  }))
}));

import { POST } from "@/app/api/onboarding/complete/route";
import { GET } from "@/app/api/onboarding/profile/route";

describe("onboarding persistence flow", () => {
  it("saves then reads v2 onboarding profile", async () => {
    const saveResponse = await POST(
      new Request("http://localhost/api/onboarding/complete", {
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
      })
    );

    expect(saveResponse.status).toBe(200);

    const readResponse = await GET();
    const payload = await readResponse.json();

    expect(readResponse.status).toBe(200);
    expect(payload.compatibilityProfile.growth_intention).toBe("alignment");
    expect(payload.attachmentAxis).toBeTruthy();
    expect(typeof payload.readinessScore).toBe("number");
  });
});
