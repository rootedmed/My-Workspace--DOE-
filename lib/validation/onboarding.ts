import { z } from "zod";

const likert = z.number().int().min(1).max(5);

export const onboardingSchema = z.object({
  firstName: z.string().trim().min(2).max(40),
  ageRange: z.enum(["24_30", "31_37", "38_45", "46_plus"]),
  locationPreference: z.enum(["same_city", "relocatable", "remote_ok"]),
  lookingFor: z.enum(["marriage_minded", "serious_relationship", "exploring"]),
  timelineMonths: z.number().int().min(3).max(60),
  readiness: z.number().int().min(1).max(5),
  weeklyCapacity: z.number().int().min(1).max(7),
  attachment: z.object({
    anxiety: z.array(likert).length(3),
    avoidance: z.array(likert).length(3)
  }),
  conflict: z.object({
    startupSoftness: likert,
    repairAfterConflict: likert
  }),
  regulation: z.object({
    calmUnderStress: likert,
    pauseBeforeReacting: likert
  }),
  personality: z.object({
    openness: likert,
    conscientiousness: likert,
    extraversion: likert,
    agreeableness: likert,
    emotionalStability: likert
  }),
  noveltyPreference: likert
});

export type OnboardingPayload = z.infer<typeof onboardingSchema>;
