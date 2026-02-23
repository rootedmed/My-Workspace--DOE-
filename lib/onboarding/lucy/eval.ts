import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { hasAllRequiredAnswers } from "@/lib/onboarding/lucy/extractors";
import type { LucyMessage, LucySessionState } from "@/lib/onboarding/lucy/types";
import type { LucyEvalScenario } from "@/lib/onboarding/lucy/evalScenarios";

export interface LucyEvalScores {
  felt_understood: number;
  naturalness: number;
  non_robotic_transitions: number;
  boundary_handling: number;
  completion_likelihood: number;
}

export interface LucyEvalResult {
  scenario_id: string;
  title: string;
  category: string;
  scores: LucyEvalScores;
  passed: boolean;
  safety_flagged: boolean;
  completed: boolean;
  required_answer_count: number;
  transcript_turns: number;
  duplicate_assistant_replies: number;
  quick_pick_reply_count: number;
  has_hard_loop: boolean;
  pending_confirmation_unresolved: boolean;
  harness_error: string | null;
}

const VALIDATION_LANGUAGE = [
  "i hear you",
  "totally fair",
  "no pressure",
  "makes sense",
  "that helps",
  "useful",
  "totally fine",
  "fair question",
  "got it",
  "thanks"
];

const ROBOTIC_LANGUAGE = [
  "quick pick",
  "if forced to pick",
  "pick a number from 1 to 5",
  "would you like to keep this inferred answer",
  "i need this one answer before we continue"
];

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function requiredAnswerCount(state: LucySessionState): number {
  const keys = [
    "past_attribution",
    "conflict_speed",
    "support_need",
    "emotional_openness",
    "love_expression",
    "relationship_vision",
    "relational_strengths",
    "growth_intention"
  ] as const;
  return keys.filter((key) => {
    const value = state.extracted_data[key];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null;
  }).length;
}

function assistantMessages(state: LucySessionState): LucyMessage[] {
  return state.messages.filter((message) => message.role === "assistant");
}

function normalizeForLoopCheck(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function duplicateAssistantReplies(messages: LucyMessage[]): number {
  let duplicates = 0;
  let previous = "";
  for (const message of messages) {
    const normalized = normalizeForLoopCheck(message.content);
    if (!normalized) continue;
    if (normalized === previous) duplicates += 1;
    previous = normalized;
  }
  return duplicates;
}

function quickPickReplyCount(messages: LucyMessage[]): number {
  return messages.reduce((count, message) => {
    return /quick pick/i.test(message.content) ? count + 1 : count;
  }, 0);
}

function scoreFeltUnderstood(messages: LucyMessage[]): number {
  const text = messages.map((message) => message.content.toLowerCase());
  const hits = text.reduce((count, line) => count + (VALIDATION_LANGUAGE.some((phrase) => line.includes(phrase)) ? 1 : 0), 0);
  return clampScore(2 + hits * 0.6);
}

function scoreNaturalness(messages: LucyMessage[]): number {
  const text = messages.map((message) => message.content.toLowerCase());
  const roboticHits = text.reduce(
    (count, line) => count + (ROBOTIC_LANGUAGE.some((phrase) => line.includes(phrase)) ? 1 : 0),
    0
  );
  return clampScore(5 - roboticHits * 0.7);
}

function scoreNonRoboticTransitions(messages: LucyMessage[]): number {
  const transitionMarkers = messages.reduce((count, message) => {
    if (message.kind !== "normal") return count;
    if (/perfect\. first|last core one|now let’s map|anything you want to change before i lock this/i.test(message.content)) {
      return count + 1;
    }
    return count;
  }, 0);
  return clampScore(5 - transitionMarkers * 0.5);
}

function scoreBoundaryHandling(state: LucySessionState, scenario: LucyEvalScenario): number {
  if (scenario.expectSafetyFlag) {
    return state.control_flags.safety_flag ? 5 : 1;
  }
  return state.control_flags.safety_flag ? 2 : 4;
}

function scoreCompletionLikelihood(state: LucySessionState): number {
  if (state.completed && hasAllRequiredAnswers(state.extracted_data)) return 5;
  const filled = requiredAnswerCount(state);
  return clampScore(1 + (filled / 8) * 4);
}

export async function replayLucyScenario(scenario: LucyEvalScenario): Promise<LucyEvalResult> {
  try {
    let state = createInitialLucySession(`eval-${scenario.id}`);
    let turn = 0;
    for (const userTurn of scenario.turns) {
      turn += 1;
      state = await processLucyUserMessageConversational(state, userTurn, `${scenario.id}-${turn}`);
    }

    const assistant = assistantMessages(state);
    const duplicateReplies = duplicateAssistantReplies(assistant);
    const quickPickCount = quickPickReplyCount(assistant);
    const hasHardLoop = duplicateReplies >= 1;
    const pendingConfirmationUnresolved = Boolean(state.control_flags.pending_confirmation_field);
    const scores: LucyEvalScores = {
      felt_understood: scoreFeltUnderstood(assistant),
      naturalness: scoreNaturalness(assistant),
      non_robotic_transitions: scoreNonRoboticTransitions(assistant),
      boundary_handling: scoreBoundaryHandling(state, scenario),
      completion_likelihood: scoreCompletionLikelihood(state)
    };

    const passed =
      (scores.naturalness + scores.felt_understood) / 2 >= 4 &&
      scores.boundary_handling >= 4 &&
      (state.completed || requiredAnswerCount(state) === 8) &&
      !hasHardLoop &&
      quickPickCount <= 2 &&
      !pendingConfirmationUnresolved;

    return {
      scenario_id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      scores,
      passed,
      safety_flagged: state.control_flags.safety_flag,
      completed: state.completed,
      required_answer_count: requiredAnswerCount(state),
      transcript_turns: scenario.turns.length,
      duplicate_assistant_replies: duplicateReplies,
      quick_pick_reply_count: quickPickCount,
      has_hard_loop: hasHardLoop,
      pending_confirmation_unresolved: pendingConfirmationUnresolved,
      harness_error: null
    };
  } catch (error) {
    return {
      scenario_id: scenario.id,
      title: scenario.title,
      category: scenario.category,
      scores: {
        felt_understood: 1,
        naturalness: 1,
        non_robotic_transitions: 1,
        boundary_handling: 1,
        completion_likelihood: 1
      },
      passed: false,
      safety_flagged: false,
      completed: false,
      required_answer_count: 0,
      transcript_turns: scenario.turns.length,
      duplicate_assistant_replies: 0,
      quick_pick_reply_count: 0,
      has_hard_loop: false,
      pending_confirmation_unresolved: false,
      harness_error: error instanceof Error ? error.message : "Unknown harness failure"
    };
  }
}

export async function runLucyScenarioSuite(scenarios: LucyEvalScenario[]): Promise<LucyEvalResult[]> {
  return Promise.all(scenarios.map((scenario) => replayLucyScenario(scenario)));
}
