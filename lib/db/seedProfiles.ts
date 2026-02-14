import type { OnboardingProfile } from "@/lib/domain/types";

export const seedProfiles: OnboardingProfile[] = [
  {
    id: "seed-ava",
    firstName: "Ava",
    ageRange: "31_37",
    locationPreference: "same_city",
    intent: { lookingFor: "marriage_minded", timelineMonths: 18, readiness: 5, weeklyCapacity: 3 },
    tendencies: {
      attachmentAnxiety: 40,
      attachmentAvoidance: 35,
      conflictRepair: 78,
      emotionalRegulation: 74,
      noveltyPreference: 55
    },
    personality: {
      openness: 62,
      conscientiousness: 80,
      extraversion: 52,
      agreeableness: 76,
      emotionalStability: 68
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "seed-liam",
    firstName: "Liam",
    ageRange: "38_45",
    locationPreference: "relocatable",
    intent: {
      lookingFor: "serious_relationship",
      timelineMonths: 24,
      readiness: 4,
      weeklyCapacity: 2
    },
    tendencies: {
      attachmentAnxiety: 48,
      attachmentAvoidance: 42,
      conflictRepair: 72,
      emotionalRegulation: 70,
      noveltyPreference: 64
    },
    personality: {
      openness: 70,
      conscientiousness: 72,
      extraversion: 60,
      agreeableness: 66,
      emotionalStability: 64
    },
    createdAt: new Date().toISOString()
  },
  {
    id: "seed-noah",
    firstName: "Noah",
    ageRange: "31_37",
    locationPreference: "remote_ok",
    intent: { lookingFor: "exploring", timelineMonths: 36, readiness: 3, weeklyCapacity: 1 },
    tendencies: {
      attachmentAnxiety: 58,
      attachmentAvoidance: 60,
      conflictRepair: 54,
      emotionalRegulation: 57,
      noveltyPreference: 84
    },
    personality: {
      openness: 83,
      conscientiousness: 55,
      extraversion: 66,
      agreeableness: 58,
      emotionalStability: 52
    },
    createdAt: new Date().toISOString()
  }
];
