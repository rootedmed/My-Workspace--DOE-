import { describe, expect, it, vi } from "vitest";
import type { OnboardingProfile } from "@/lib/domain/types";

let savedProfile: OnboardingProfile | null = null;

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

vi.mock("@/lib/db/client", () => ({
  db: {
    saveProfile: vi.fn(async (_userId: string, input: Omit<OnboardingProfile, "id" | "createdAt">) => {
      savedProfile = {
        id: "user-1",
        createdAt: new Date().toISOString(),
        ...input
      };
      return savedProfile;
    }),
    getProfile: vi.fn(async () => savedProfile)
  }
}));

import { POST } from "@/app/api/onboarding/complete/route";
import { GET } from "@/app/api/onboarding/profile/route";

describe("onboarding persistence flow", () => {
  it("saves then reads onboarding profile", async () => {
    const saveResponse = await POST(
      new Request("http://localhost/api/onboarding/complete", {
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
      })
    );

    expect(saveResponse.status).toBe(200);

    const readResponse = await GET();
    const payload = await readResponse.json();

    expect(readResponse.status).toBe(200);
    expect(payload.profile.firstName).toBe("Maya");
  });
});
