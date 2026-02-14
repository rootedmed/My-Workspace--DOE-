import { describe, expect, it, vi } from "vitest";

const {
  getCurrentUserMock,
  getProfileMock,
  getCalibrationMock,
  getCandidatePoolMock,
  saveMatchResultsMock,
  scoreCompatibilityMock
} = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  getProfileMock: vi.fn(),
  getCalibrationMock: vi.fn(),
  getCandidatePoolMock: vi.fn(),
  saveMatchResultsMock: vi.fn(),
  scoreCompatibilityMock: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    getProfile: getProfileMock,
    getCalibration: getCalibrationMock,
    getCandidatePool: getCandidatePoolMock,
    saveMatchResults: saveMatchResultsMock
  }
}));

vi.mock("@/lib/matching/compatibility", () => ({
  scoreCompatibility: scoreCompatibilityMock
}));

import { GET } from "@/app/api/matches/preview/route";

describe("GET /api/matches/preview authorization scoping", () => {
  it("uses only the session user id for profile, candidate pool, and saved matches", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1" });
    getProfileMock.mockResolvedValueOnce({
      id: "profile-1",
      firstName: "Alex",
      ageRange: "31_37",
      locationPreference: "same_city",
      intent: {
        lookingFor: "marriage_minded",
        timelineMonths: 12,
        readiness: 4,
        weeklyCapacity: 2
      },
      tendencies: {
        attachmentAnxiety: 0.4,
        attachmentAvoidance: 0.3,
        conflictRepair: 0.6,
        emotionalRegulation: 0.7,
        noveltyPreference: 0.4
      },
      personality: {
        openness: 0.5,
        conscientiousness: 0.6,
        extraversion: 0.5,
        agreeableness: 0.7,
        emotionalStability: 0.6
      },
      createdAt: "2026-01-01T00:00:00.000Z"
    });
    getCalibrationMock.mockResolvedValueOnce(null);
    getCandidatePoolMock.mockResolvedValueOnce([{ id: "profile-2" }]);
    scoreCompatibilityMock.mockReturnValue({
      candidateId: "profile-2",
      candidateFirstName: "Jordan",
      totalScore: 91,
      hardFilterPass: true,
      reasons: ["Aligned relationship intent"],
      topFitReasons: ["Aligned relationship intent"],
      potentialFrictionPoints: ["Different social pace"],
      conversationPrompts: ["How do you recharge each week?"],
      componentScores: {
        intent: 95,
        lifestyle: 88,
        attachment: 90,
        conflictRegulation: 89,
        personality: 87,
        novelty: 82
      }
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(getProfileMock).toHaveBeenCalledWith("user-1");
    expect(getCalibrationMock).toHaveBeenCalledWith("user-1");
    expect(getCandidatePoolMock).toHaveBeenCalledWith("user-1");
    expect(saveMatchResultsMock).toHaveBeenCalledWith(
      "user-1",
      expect.arrayContaining([expect.objectContaining({ candidateId: "profile-2" })])
    );
  });
});
