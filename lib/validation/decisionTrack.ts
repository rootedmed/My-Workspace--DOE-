import { z } from "zod";

export const decisionTrackRequestSchema = z.object({
  firstName: z.string().trim().min(2).max(40),
  commitmentGoal: z.enum(["marriage", "long_term", "serious_exploration"]),
  weeklyDateCapacity: z.coerce.number().int().min(1).max(7),
  decisionPace: z.enum(["steady", "intentional", "fast_clear"]),
  reflectionTrait: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .describe("Self-reflection trait, not a medical or diagnostic label.")
});

export type DecisionTrackRequest = z.infer<typeof decisionTrackRequestSchema>;

const dayLabels = [
  "Personal Intent",
  "Relationship Values",
  "Lifestyle Fit",
  "Communication Style",
  "Conflict Approach",
  "Family & Community",
  "Career & Time Planning",
  "Money Philosophy",
  "Boundaries",
  "Affection & Intimacy Expectations",
  "Decision-Making Patterns",
  "Future Timeline Alignment",
  "Mutual Accountability",
  "Final Decision Reflection"
] as const;

type DecisionTrackDay = {
  day: number;
  focus: string;
  prompt: string;
};

export function buildDecisionTrack(input: DecisionTrackRequest): DecisionTrackDay[] {
  return dayLabels.map((label, index) => {
    const day = index + 1;

    return {
      day,
      focus: label,
      prompt: `Day ${day}: ${input.firstName}, reflect on "${label}" through your "${input.reflectionTrait}" lens and note whether this supports your ${input.commitmentGoal.replace("_", " ")} goal at a ${input.decisionPace.replace("_", " ")} pace.`
    };
  });
}
