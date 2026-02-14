import { describe, expect, it } from "vitest";
import { passesHardFilters, scoreCompatibility } from "@/lib/matching/compatibility";
import type { OnboardingProfile } from "@/lib/domain/types";

const baseProfile: OnboardingProfile = {
  id: "user-1",
  firstName: "Maya",
  ageRange: "31_37",
  locationPreference: "same_city",
  intent: { lookingFor: "marriage_minded", timelineMonths: 18, readiness: 4, weeklyCapacity: 2 },
  tendencies: {
    attachmentAnxiety: 40,
    attachmentAvoidance: 35,
    conflictRepair: 70,
    emotionalRegulation: 72,
    noveltyPreference: 55
  },
  personality: {
    openness: 60,
    conscientiousness: 75,
    extraversion: 50,
    agreeableness: 78,
    emotionalStability: 70
  },
  createdAt: new Date().toISOString()
};

describe("compatibility scoring", () => {
  it("returns high score for a compatible profile", () => {
    const candidate: OnboardingProfile = {
      ...baseProfile,
      id: "cand-1",
      firstName: "Ava"
    };
    const result = scoreCompatibility(baseProfile, candidate);
    expect(result.hardFilterPass).toBe(true);
    expect(result.totalScore).toBeGreaterThan(80);
  });

  it("fails hard filters for marriage-vs-exploring mismatch", () => {
    const candidate: OnboardingProfile = {
      ...baseProfile,
      id: "cand-2",
      firstName: "Noah",
      intent: {
        lookingFor: "exploring",
        timelineMonths: 40,
        readiness: 3,
        weeklyCapacity: 1
      }
    };
    const hardFilter = passesHardFilters(baseProfile, candidate);
    expect(hardFilter.pass).toBe(false);
    expect(hardFilter.reasons.length).toBeGreaterThan(0);
  });
});
