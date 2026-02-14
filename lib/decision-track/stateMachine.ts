import type { DecisionState, DecisionTrack } from "@/lib/domain/types";

export type DecisionAction = "start" | "complete_reflection" | "advance_day" | "pause" | "resume" | "finish";

const prompts = [
  "Set your relationship intention for this match in one sentence.",
  "Share one core value you want to protect in partnership.",
  "Name a recent moment you felt emotionally safe in connection.",
  "Discuss long-term priorities: home, family, career sequence.",
  "Compare weekly routines and time expectations.",
  "Discuss money communication norms and transparency habits.",
  "Share how each person defines reliability and follow-through.",
  "Describe your conflict startup pattern under stress.",
  "Practice one repair phrase you can use after tension.",
  "Share what helps you regulate when overwhelmed.",
  "Identify one recurring trigger and one de-escalation plan.",
  "Align on 12-month commitment milestones.",
  "Discuss exclusivity expectations and practical boundaries.",
  "Write a final reflection: continue, pause, or close."
] as const;

function now(): string {
  return new Date().toISOString();
}

function phaseByDay(day: number): Exclude<DecisionState, "not_started" | "completed" | "paused"> {
  if (day <= 3) {
    return "active_intro";
  }
  if (day <= 7) {
    return "active_values";
  }
  if (day <= 11) {
    return "active_stress_test";
  }
  return "active_decision";
}

export function getPromptForDay(day: number): string {
  const safeDay = Math.max(1, Math.min(14, day));
  return prompts[safeDay - 1] ?? prompts[0];
}

export function getNudge(state: DecisionState, day: number): string {
  if (state === "active_intro") {
    return "Keep this light and clear: one concrete reflection is enough for today.";
  }
  if (state === "active_values") {
    return "Look for consistency between words and weekly actions.";
  }
  if (state === "active_stress_test") {
    return "Discuss one hard topic directly; aim for repair, not perfection.";
  }
  if (state === "active_decision") {
    return "Choose clarity over ambiguity. Respectful closure is always an acceptable outcome.";
  }
  if (state === "paused") {
    return "Paused is valid. Resume when you can engage with steadiness and respect.";
  }
  if (day >= 14) {
    return "You have enough signal to make a clear next-step decision.";
  }
  return "Stay consistent and specific.";
}

export function getClosureTemplate(choice: "continue" | "pause" | "close"): string {
  if (choice === "continue") {
    return "I appreciate this connection and would like to continue intentionally. Are you aligned on next steps?";
  }
  if (choice === "pause") {
    return "I value our conversations and need a short pause to reflect. I will follow up by [date].";
  }
  return "Thank you for the time and honesty. I do not feel the long-term fit, and I want to close this respectfully.";
}

export function transitionDecisionTrack(track: DecisionTrack, action: DecisionAction): DecisionTrack {
  const updated: DecisionTrack = { ...track, updatedAt: now() };

  if (action === "start" && track.state === "not_started") {
    updated.day = 1;
    updated.state = "active_intro";
    updated.previousState = "active_intro";
    return updated;
  }

  if (action === "pause" && track.state !== "paused" && track.state !== "completed") {
    updated.previousState = track.state === "not_started" ? "active_intro" : track.state;
    updated.state = "paused";
    return updated;
  }

  if (action === "resume" && track.state === "paused") {
    updated.state = track.previousState ?? phaseByDay(updated.day);
    return updated;
  }

  if (track.state === "completed" || track.state === "not_started") {
    return updated;
  }

  if (track.state === "paused") {
    return updated;
  }

  if (action === "complete_reflection") {
    updated.reflectionCount += 1;
    return updated;
  }

  if (action === "advance_day") {
    if (updated.day < 14) {
      updated.day += 1;
      updated.state = phaseByDay(updated.day);
    }
    return updated;
  }

  if (action === "finish" && updated.day >= 14) {
    updated.state = "completed";
    return updated;
  }

  return updated;
}
