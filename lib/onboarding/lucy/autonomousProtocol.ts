import { processLucyUserMessageConversational } from "@/lib/onboarding/lucy/conversationalEngine";
import { createInitialLucySession } from "@/lib/onboarding/lucy/engine";
import { enableFreeConversationMode, processLucyFreeConversationAction } from "@/lib/onboarding/lucy/freeConversationEngine";
import type { LucyAnswerField, LucyMessage, LucySessionState } from "@/lib/onboarding/lucy/types";
import { LUCY_AUTONOMOUS_SCENARIOS, type LucyAutonomousScenario, type ScenarioFieldExpectation } from "@/lib/onboarding/lucy/autonomousScenarios";

type ScoreKey =
  | "extraction_accuracy"
  | "conversation_naturalness"
  | "personality_consistency"
  | "edge_case_handling"
  | "completion";

type ScoreBlock = Record<ScoreKey, number>;

type Severity = "critical" | "high" | "medium" | "low";

interface Exchange {
  turn: number;
  user: string;
  assistant: string;
  assistant_kind: LucyMessage["kind"] | "none";
}

interface FieldCheckResult {
  field: LucyAnswerField;
  expected: ScenarioFieldExpectation;
  actualValue: unknown;
  actualConfidence: number;
  matched: boolean;
}

export interface LucyProtocolIssue {
  code:
    | "extraction_mismatch"
    | "repeated_prompt"
    | "robotic_transition"
    | "personality_clinical"
    | "validation_missing"
    | "redirect_failure"
    | "contradiction_loop"
    | "completion_gap"
    | "technical_loop";
  severity: Severity;
  scenario_id: string;
  dimension: ScoreKey | "system";
  exchange?: Exchange;
  details: string;
  root_cause_hypothesis: string;
}

export interface LucyScenarioRunResult {
  scenario_id: string;
  title: string;
  category: LucyAutonomousScenario["category"];
  scores: ScoreBlock;
  overall_score: number;
  completed: boolean;
  required_answers_captured: number;
  field_checks: FieldCheckResult[];
  exchanges: Exchange[];
  issues: LucyProtocolIssue[];
}

export interface LucyIssuePriority {
  code: LucyProtocolIssue["code"];
  severity: Severity;
  affected_scenarios: number;
  occurrences: number;
  impact_score: number;
  summary: string;
}

export interface LucyAutonomousIterationReport {
  iteration: number;
  timestamp: string;
  scenario_count: number;
  scenario_results: LucyScenarioRunResult[];
  average_scores: ScoreBlock;
  overall_average: number;
  completion_rate: number;
  dimension_accuracy: Record<LucyAnswerField, number>;
  prioritized_issues: LucyIssuePriority[];
}

export interface LucyAutonomousRunOptions {
  engine?: "free_chat" | "conversational";
  /**
   * If provided, every turn will pass through this function after engine processing.
   * Useful for simulating DB save/load round-trips and catching hydration bugs.
   */
  roundTripStateEachTurn?: (state: LucySessionState) => LucySessionState | Promise<LucySessionState>;
}

const VALIDATION_PATTERNS: RegExp[] = [
  /that sounds/i,
  /i hear you/i,
  /makes sense/i,
  /totally fair/i,
  /that'?s hard/i,
  /frustrating/i,
  /no pressure/i,
  /fair question/i
];

const ROBOTIC_PATTERNS: RegExp[] = [
  /different angle\./i,
  /quick pick/i,
  /would you say the bigger issue/i,
  /which two are most/i,
  /pick a number/i,
  /keep this\?/i,
  /if forced to pick/i
];

const WARM_PATTERNS: RegExp[] = [
  /i hear you/i,
  /that sounds/i,
  /totally fair/i,
  /makes sense/i,
  /i'm here to help/i,
  /thanks for sharing/i
];

const CLINICAL_PATTERNS: RegExp[] = [
  /quick pick/i,
  /keep this\?/i,
  /would you say/i,
  /different angle/i,
  /let'?s use a quick pick/i,
  /scale:\s*1=/i
];

const REDIRECT_PATTERNS: RegExp[] = [
  /quick one from me first/i,
  /let'?s finish this/i,
  /i need this one answer/i,
  /switch to quick questions/i
];

const CRITICAL_WEIGHTS: Record<Severity, number> = {
  critical: 8,
  high: 5,
  medium: 3,
  low: 1
};

const REQUIRED_FIELDS: LucyAnswerField[] = [
  "past_attribution",
  "conflict_speed",
  "support_need",
  "emotional_openness",
  "love_expression",
  "relationship_vision",
  "relational_strengths",
  "growth_intention"
];

function clampScore(value: number): number {
  return Math.max(1, Math.min(5, Math.round(value)));
}

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function countRequiredAnswers(state: LucySessionState): number {
  return REQUIRED_FIELDS.filter((field) => {
    const value = state.extracted_data[field];
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null;
  }).length;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAnyPattern(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function matchesExpectation(actual: unknown, expected: ScenarioFieldExpectation): boolean {
  const mode = expected.comparator ?? "exact";

  if (mode === "contains_all") {
    if (!Array.isArray(actual)) return false;
    if (!Array.isArray(expected.value)) return false;
    const actualSet = new Set(actual.map((entry) => String(entry).toLowerCase()));
    return expected.value.every((entry) => actualSet.has(String(entry).toLowerCase()));
  }

  if (mode === "one_of") {
    if (Array.isArray(expected.value)) {
      return expected.value.some((entry) => normalizeText(String(entry)) === normalizeText(String(actual)));
    }
    return normalizeText(String(actual)) === normalizeText(String(expected.value));
  }

  if (Array.isArray(actual) && Array.isArray(expected.value)) {
    const left = [...actual].map((entry) => normalizeText(String(entry))).sort();
    const right = [...expected.value].map((entry) => normalizeText(String(entry))).sort();
    return JSON.stringify(left) === JSON.stringify(right);
  }

  return normalizeText(String(actual)) === normalizeText(String(expected.value));
}

function checkExpectedFields(state: LucySessionState, scenario: LucyAutonomousScenario): FieldCheckResult[] {
  return REQUIRED_FIELDS.map((field) => {
    const expected = scenario.expectedExtractions[field];
    const actualValue = state.extracted_data[field];
    const actualConfidence = state.extraction_envelopes[field]?.confidence ?? 0;
    const valueMatched = matchesExpectation(actualValue, expected);
    const confidenceMatched = actualConfidence >= expected.confidenceMin;
    return {
      field,
      expected,
      actualValue,
      actualConfidence,
      matched: valueMatched && confidenceMatched
    };
  });
}

function duplicateAssistantReplies(exchanges: Exchange[]): number {
  let duplicates = 0;
  let previous = "";
  for (const exchange of exchanges) {
    const current = normalizeText(exchange.assistant);
    if (!current) continue;
    if (current === previous) duplicates += 1;
    previous = current;
  }
  return duplicates;
}

function quickPickReplyCount(exchanges: Exchange[]): number {
  return exchanges.reduce((count, exchange) => (hasAnyPattern(exchange.assistant, [/quick pick/i]) ? count + 1 : count), 0);
}

function scoreExtraction(fieldChecks: FieldCheckResult[]): number {
  const matched = fieldChecks.filter((check) => check.matched).length;
  const allHighConfidence = fieldChecks.every((check) => check.actualConfidence >= 80);
  if (matched === 8 && allHighConfidence) return 5;
  if (matched >= 7) return 4;
  if (matched >= 6) return 3;
  if (matched >= 5) return 2;
  return 1;
}

function scoreNaturalness(exchanges: Exchange[]): number {
  const duplicateCount = duplicateAssistantReplies(exchanges);
  const roboticHits = exchanges.reduce((count, exchange) => count + (hasAnyPattern(exchange.assistant, ROBOTIC_PATTERNS) ? 1 : 0), 0);
  const quickPickCount = quickPickReplyCount(exchanges);
  let score = 5;
  score -= duplicateCount * 1.5;
  score -= roboticHits * 0.4;
  if (quickPickCount > 2) score -= 1;
  return clampScore(score);
}

function scorePersonality(exchanges: Exchange[]): number {
  const warmHits = exchanges.reduce((count, exchange) => count + (hasAnyPattern(exchange.assistant, WARM_PATTERNS) ? 1 : 0), 0);
  const clinicalHits = exchanges.reduce((count, exchange) => count + (hasAnyPattern(exchange.assistant, CLINICAL_PATTERNS) ? 1 : 0), 0);
  const duplicateCount = duplicateAssistantReplies(exchanges);
  let score = 3;
  score += Math.min(2, warmHits * 0.35);
  score -= Math.min(2.5, clinicalHits * 0.45);
  score -= duplicateCount * 0.5;
  return clampScore(score);
}

function scoreEdgeCaseHandling(state: LucySessionState, scenario: LucyAutonomousScenario, exchanges: Exchange[]): number {
  if (duplicateAssistantReplies(exchanges) > 0) return 1;

  if (scenario.id === "s07_off_topic_repeated") {
    const redirectCount = exchanges.filter((exchange) => hasAnyPattern(exchange.assistant, REDIRECT_PATTERNS)).length;
    if (redirectCount === 0) return 2;
    return redirectCount >= 2 ? 5 : 4;
  }

  if (scenario.id === "s08_contradictory_answers") {
    const contradictionPrompts = exchanges.filter((exchange) =>
      /are both true|quick check: you described|growth goal/i.test(exchange.assistant)
    ).length;
    if (contradictionPrompts > 1) return 2;
    return contradictionPrompts === 1 ? 5 : 3;
  }

  if (scenario.id === "s09_hostile_user") {
    if (state.control_flags.safety_flag) return 2;
    const boundaryHandled = exchanges.some((exchange) =>
      /to keep this useful|quick one from me first|let'?s finish/i.test(exchange.assistant)
    );
    return boundaryHandled ? 5 : 3;
  }

  if (scenario.id === "s15_vent_without_rushing" || scenario.id === "s04_avoidant_ex_vent") {
    const firstVentingReply = exchanges[1]?.assistant ?? "";
    return hasAnyPattern(firstVentingReply, VALIDATION_PATTERNS) ? 5 : 2;
  }

  if (scenario.id === "s14_validate_before_redirect") {
    const firstVentingReply = exchanges[1]?.assistant ?? "";
    if (!hasAnyPattern(firstVentingReply, VALIDATION_PATTERNS)) return 2;
    const abruptRedirect = exchanges.some((exchange) => /different angle\./i.test(exchange.assistant));
    return abruptRedirect ? 3 : 5;
  }

  return 4;
}

function scoreCompletion(state: LucySessionState): number {
  const captured = countRequiredAnswers(state);
  if (state.completed && captured === 8) return 5;
  if (captured >= 7) return 4;
  if (captured >= 6) return 3;
  if (captured >= 5) return 2;
  return 1;
}

function findFirstExchangeMatching(exchanges: Exchange[], patterns: RegExp[]): Exchange | undefined {
  return exchanges.find((exchange) => hasAnyPattern(exchange.assistant, patterns));
}

function buildIssues(
  scenario: LucyAutonomousScenario,
  state: LucySessionState,
  exchanges: Exchange[],
  fieldChecks: FieldCheckResult[],
  scores: ScoreBlock
): LucyProtocolIssue[] {
  const issues: LucyProtocolIssue[] = [];

  const extractionMismatches = fieldChecks.filter((check) => !check.matched);
  if (scores.extraction_accuracy <= 3 && extractionMismatches.length > 0) {
    for (const mismatch of extractionMismatches.slice(0, 3)) {
      issues.push({
        code: "extraction_mismatch",
        severity: scores.extraction_accuracy <= 2 ? "critical" : "high",
        scenario_id: scenario.id,
        dimension: "extraction_accuracy",
        details: `Field ${mismatch.field} expected ${JSON.stringify(mismatch.expected.value)} @ >=${mismatch.expected.confidenceMin} but got ${JSON.stringify(mismatch.actualValue)} @ ${mismatch.actualConfidence}.`,
        root_cause_hypothesis: "Extraction rules or LLM interpretation underfit this phrasing."
      });
    }
  }

  const duplicateCount = duplicateAssistantReplies(exchanges);
  if (duplicateCount > 0) {
    issues.push({
      code: "repeated_prompt",
      severity: "critical",
      scenario_id: scenario.id,
      dimension: "conversation_naturalness",
      exchange: exchanges.find((exchange, index) => index > 0 && normalizeText(exchange.assistant) === normalizeText(exchanges[index - 1]?.assistant ?? "")),
      details: `Found ${duplicateCount} consecutive duplicate assistant reply pair(s).`,
      root_cause_hypothesis: "Pending confirmation / unresolved attempt branch repeated without state progression."
    });
  }

  if (scores.conversation_naturalness <= 3) {
    issues.push({
      code: "robotic_transition",
      severity: "high",
      scenario_id: scenario.id,
      dimension: "conversation_naturalness",
      exchange: findFirstExchangeMatching(exchanges, ROBOTIC_PATTERNS),
      details: "Robotic forced-choice phrasing dominated this flow.",
      root_cause_hypothesis: "Fallback phrasing relies on checklist prompts too early."
    });
  }

  if (scores.personality_consistency <= 3) {
    issues.push({
      code: "personality_clinical",
      severity: "high",
      scenario_id: scenario.id,
      dimension: "personality_consistency",
      exchange: findFirstExchangeMatching(exchanges, CLINICAL_PATTERNS),
      details: "Lucy tone drifted to structured/clinical language.",
      root_cause_hypothesis: "Template responses override conversational voice under uncertainty."
    });
  }

  if (scenario.id === "s14_validate_before_redirect" || scenario.id === "s15_vent_without_rushing" || scenario.id === "s04_avoidant_ex_vent") {
    const firstVentingReply = exchanges[1]?.assistant ?? "";
    if (!hasAnyPattern(firstVentingReply, VALIDATION_PATTERNS)) {
      issues.push({
        code: "validation_missing",
        severity: "high",
        scenario_id: scenario.id,
        dimension: "edge_case_handling",
        exchange: exchanges[1],
        details: "Lucy did not validate emotion before steering.",
        root_cause_hypothesis: "Validation-first guard not enforced in early-stage pivots."
      });
    }
  }

  if (scenario.id === "s07_off_topic_repeated") {
    const redirectCount = exchanges.filter((exchange) => hasAnyPattern(exchange.assistant, REDIRECT_PATTERNS)).length;
    if (redirectCount === 0) {
      issues.push({
        code: "redirect_failure",
        severity: "high",
        scenario_id: scenario.id,
        dimension: "edge_case_handling",
        details: "No redirect response found for repeated off-topic turns.",
        root_cause_hypothesis: "Off-topic detection threshold too strict for conversational chatter."
      });
    }
  }

  if (scenario.id === "s08_contradictory_answers") {
    const contradictionPrompts = exchanges.filter((exchange) => /are both true|growth goal/i.test(exchange.assistant)).length;
    if (contradictionPrompts > 1) {
      issues.push({
        code: "contradiction_loop",
        severity: "critical",
        scenario_id: scenario.id,
        dimension: "edge_case_handling",
        details: `Contradiction prompt repeated ${contradictionPrompts} times.`,
        root_cause_hypothesis: "Contradiction marker not persisted after first reconciliation."
      });
    }
  }

  if (scores.completion <= 3) {
    const missing = REQUIRED_FIELDS.filter((field) => {
      const value = state.extracted_data[field];
      if (Array.isArray(value)) return value.length === 0;
      return value === undefined || value === null;
    });
    issues.push({
      code: "completion_gap",
      severity: scores.completion <= 2 ? "critical" : "high",
      scenario_id: scenario.id,
      dimension: "completion",
      details: `Conversation ended with missing required fields: ${missing.join(", ") || "none"}.`,
      root_cause_hypothesis: "Gap-fill strategy escalates to rigid prompts and loses user momentum."
    });
  }

  const hardRepeat = duplicateAssistantReplies(exchanges) > 0;
  const excessiveQuickPick = quickPickReplyCount(exchanges) > 3 && !state.completed;
  if (hardRepeat || excessiveQuickPick) {
    issues.push({
      code: "technical_loop",
      severity: "critical",
      scenario_id: scenario.id,
      dimension: "system",
      details: "Loop counters exceeded safe threshold in this scenario.",
      root_cause_hypothesis: "State machine fallback branches are not clearing pending prompts quickly enough."
    });
  }

  return issues;
}

function prioritizeIssues(issues: LucyProtocolIssue[]): LucyIssuePriority[] {
  const grouped = new Map<string, LucyIssuePriority>();
  for (const issue of issues) {
    const key = issue.code;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        code: issue.code,
        severity: issue.severity,
        affected_scenarios: 1,
        occurrences: 1,
        impact_score: CRITICAL_WEIGHTS[issue.severity],
        summary: issue.details
      });
      continue;
    }

    current.occurrences += 1;
    current.impact_score += CRITICAL_WEIGHTS[issue.severity];
    current.severity =
      CRITICAL_WEIGHTS[issue.severity] > CRITICAL_WEIGHTS[current.severity] ? issue.severity : current.severity;
    if (!current.summary.includes(issue.details)) {
      current.summary = `${current.summary} | ${issue.details}`;
    }
  }

  // Recompute affected scenario count accurately.
  for (const priority of grouped.values()) {
    const scenarios = new Set(
      issues.filter((issue) => issue.code === priority.code).map((issue) => issue.scenario_id)
    );
    priority.affected_scenarios = scenarios.size;
  }

  return [...grouped.values()].sort((a, b) => b.impact_score - a.impact_score);
}

function dimensionAccuracy(results: LucyScenarioRunResult[]): Record<LucyAnswerField, number> {
  const counts = new Map<LucyAnswerField, { matched: number; total: number }>();
  for (const field of REQUIRED_FIELDS) {
    counts.set(field, { matched: 0, total: 0 });
  }

  for (const result of results) {
    for (const check of result.field_checks) {
      const bucket = counts.get(check.field);
      if (!bucket) continue;
      bucket.total += 1;
      if (check.matched) bucket.matched += 1;
    }
  }

  return REQUIRED_FIELDS.reduce(
    (acc, field) => {
      const bucket = counts.get(field)!;
      acc[field] = bucket.total === 0 ? 0 : Number(((bucket.matched / bucket.total) * 100).toFixed(1));
      return acc;
    },
    {} as Record<LucyAnswerField, number>
  );
}

async function runSingleScenario(
  scenario: LucyAutonomousScenario,
  options?: LucyAutonomousRunOptions
): Promise<LucyScenarioRunResult> {
  const engine = options?.engine ?? "free_chat";
  let state = createInitialLucySession(`autonomous-${scenario.id}`);
  if (engine === "free_chat") {
    state = enableFreeConversationMode(state);
  }
  const exchanges: Exchange[] = [];

  for (let index = 0; index < scenario.turns.length; index += 1) {
    const user = scenario.turns[index]!;
    const assistantBefore = state.messages.filter((message) => message.role === "assistant").length;
    state =
      engine === "free_chat"
        ? await processLucyFreeConversationAction(state, {
            action: "send",
            message: user,
            clientMessageId: `${scenario.id}-${index + 1}`
          })
        : await processLucyUserMessageConversational(state, user, `${scenario.id}-${index + 1}`);
    if (options?.roundTripStateEachTurn) {
      state = await options.roundTripStateEachTurn(state);
    }
    const assistants = state.messages.filter((message) => message.role === "assistant");
    const lastAssistant = assistants[assistants.length - 1];
    exchanges.push({
      turn: index + 1,
      user,
      assistant: lastAssistant?.content ?? "",
      assistant_kind: lastAssistant?.kind ?? "none"
    });

    const assistantAfter = assistants.length;
    if (assistantAfter === assistantBefore) {
      exchanges[exchanges.length - 1]!.assistant = "(no assistant reply)";
    }
  }

  if (engine === "free_chat") {
    const assistantBefore = state.messages.filter((message) => message.role === "assistant").length;
    state = await processLucyFreeConversationAction(state, { action: "finish" });
    if (state.control_flags.free_followup_pending) {
      state = await processLucyFreeConversationAction(state, {
        action: "send",
        message:
          "When stressed I need validation, I open up after trust, I show care through time and words, and I want alignment.",
        clientMessageId: `${scenario.id}-followup`
      });
      state = await processLucyFreeConversationAction(state, { action: "finish" });
    }
    if (options?.roundTripStateEachTurn) {
      state = await options.roundTripStateEachTurn(state);
    }
    const assistants = state.messages.filter((message) => message.role === "assistant");
    const assistantAfter = assistants.length;
    if (assistantAfter > assistantBefore) {
      const lastAssistant = assistants[assistants.length - 1];
      exchanges.push({
        turn: scenario.turns.length + 1,
        user: "(finish)",
        assistant: lastAssistant?.content ?? "(no assistant reply)",
        assistant_kind: lastAssistant?.kind ?? "none"
      });
    }
  }

  const fieldChecks = checkExpectedFields(state, scenario);
  const scores: ScoreBlock = {
    extraction_accuracy: scoreExtraction(fieldChecks),
    conversation_naturalness: scoreNaturalness(exchanges),
    personality_consistency: scorePersonality(exchanges),
    edge_case_handling: scoreEdgeCaseHandling(state, scenario, exchanges),
    completion: scoreCompletion(state)
  };
  const issues = buildIssues(scenario, state, exchanges, fieldChecks, scores);
  const overall = Number(avg(Object.values(scores)).toFixed(2));

  return {
    scenario_id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    scores,
    overall_score: overall,
    completed: state.completed,
    required_answers_captured: countRequiredAnswers(state),
    field_checks: fieldChecks,
    exchanges,
    issues
  };
}

function averageScores(results: LucyScenarioRunResult[]): ScoreBlock {
  const keys: ScoreKey[] = [
    "extraction_accuracy",
    "conversation_naturalness",
    "personality_consistency",
    "edge_case_handling",
    "completion"
  ];

  return keys.reduce(
    (acc, key) => {
      acc[key] = Number(avg(results.map((result) => result.scores[key])).toFixed(2));
      return acc;
    },
    {} as ScoreBlock
  );
}

export async function runLucyAutonomousIteration(
  iteration = 1,
  options?: LucyAutonomousRunOptions
): Promise<LucyAutonomousIterationReport> {
  const scenario_results: LucyScenarioRunResult[] = [];
  for (const scenario of LUCY_AUTONOMOUS_SCENARIOS) {
    scenario_results.push(await runSingleScenario(scenario, options));
  }

  const allIssues = scenario_results.flatMap((result) => result.issues);
  const avgScores = averageScores(scenario_results);
  const overall = Number(avg(scenario_results.map((result) => result.overall_score)).toFixed(2));
  const completionRate =
    scenario_results.length === 0
      ? 0
      : Number(
          (
            (scenario_results.filter((result) => result.completed || result.required_answers_captured === 8).length /
              scenario_results.length) *
            100
          ).toFixed(1)
        );

  return {
    iteration,
    timestamp: new Date().toISOString(),
    scenario_count: scenario_results.length,
    scenario_results,
    average_scores: avgScores,
    overall_average: overall,
    completion_rate: completionRate,
    dimension_accuracy: dimensionAccuracy(scenario_results),
    prioritized_issues: prioritizeIssues(allIssues)
  };
}
