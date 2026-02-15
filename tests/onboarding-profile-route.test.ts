import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1" }))
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    getProfile: vi.fn(async () => ({
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
        attachmentAnxiety: 55,
        attachmentAvoidance: 45,
        conflictRepair: 60,
        emotionalRegulation: 58,
        noveltyPreference: 40
      },
      personality: {
        openness: 52,
        conscientiousness: 57,
        extraversion: 49,
        agreeableness: 63,
        emotionalStability: 54
      },
      createdAt: new Date().toISOString()
    }))
  }
}));

import { GET } from "@/app/api/onboarding/profile/route";

describe("GET /api/onboarding/profile", () => {
  it("returns existing saved profile", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.profile.firstName).toBe("Maya");
    expect(Array.isArray(payload.tendenciesSummary)).toBe(true);
  });
});
