import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" }))
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              compatibility_profile: {
                growth_intention: "alignment"
              },
              attachment_axis: "secure",
              readiness_score: 72,
              completed_at: new Date().toISOString()
            },
            error: null
          })
        })
      })
    })
  }))
}));

import { GET } from "@/app/api/onboarding/profile/route";

describe("GET /api/onboarding/profile", () => {
  it("returns existing saved profile", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.compatibilityProfile.growth_intention).toBe("alignment");
    expect(payload.attachmentAxis).toBe("secure");
    expect(payload.readinessScore).toBe(72);
  });
});
