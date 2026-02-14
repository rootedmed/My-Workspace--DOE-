import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" }))
}));

vi.mock("@/lib/security/csrf", () => ({
  isValidCsrf: vi.fn(() => true)
}));

import { POST } from "@/app/api/onboarding/complete/route";

describe("POST /api/onboarding/complete", () => {
  it("saves profile and returns tendencies summary", async () => {
    const request = new Request("http://localhost/api/onboarding/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: "Maya",
        ageRange: "31_37",
        locationPreference: "same_city",
        lookingFor: "marriage_minded",
        timelineMonths: 18,
        readiness: 4,
        weeklyCapacity: 2,
        attachment: { anxiety: [3, 4, 3], avoidance: [2, 3, 2] },
        conflict: { startupSoftness: 4, repairAfterConflict: 4 },
        regulation: { calmUnderStress: 3, pauseBeforeReacting: 4 },
        personality: {
          openness: 4,
          conscientiousness: 4,
          extraversion: 3,
          agreeableness: 4,
          emotionalStability: 3
        },
        noveltyPreference: 3
      })
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.profile.firstName).toBe("Maya");
    expect(Array.isArray(payload.tendenciesSummary)).toBe(true);
    expect(payload.profile.tendencies.attachmentAnxiety).toBeGreaterThanOrEqual(0);
  });
});
