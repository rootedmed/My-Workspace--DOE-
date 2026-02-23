import type { LucyAnswerField } from "@/lib/onboarding/lucy/types";

export type ScenarioFieldExpectation = {
  value: unknown;
  confidenceMin: number;
  comparator?: "exact" | "contains_all" | "one_of";
};

export interface LucyAutonomousScenario {
  id: string;
  title: string;
  category:
    | "openness_spectrum"
    | "pain_point"
    | "edge_case"
    | "dimension_focus"
    | "quality";
  persona: string;
  objective: string;
  turns: string[];
  expectedBehavior: string[];
  expectedExtractions: Record<LucyAnswerField, ScenarioFieldExpectation>;
  successCriteria: string[];
}

export const LUCY_AUTONOMOUS_SCENARIOS: LucyAutonomousScenario[] = [
  {
    id: "s01_oversharer_trauma_dump",
    title: "Over-sharer with long emotional venting",
    category: "openness_spectrum",
    persona:
      "Highly expressive user with long paragraphs, wants to feel deeply understood, tends to vent before answering directly.",
    objective: "Verify Lucy can hold space, extract multiple signals, and still complete onboarding.",
    turns: [
      "yes",
      "Honestly my ex used to disappear whenever anything got hard and I always felt like I was asking for too much emotional depth.",
      "When conflict happens I want to talk through it right away because silence makes things worse.",
      "When I am stressed I need to feel heard first before solutions.",
      "I open up pretty fast once I trust the person.",
      "I show love through words and quality time.",
      "I want a best-friend type relationship where we actually talk.",
      "My strengths are honesty and support.",
      "I want deeper emotional honesty this time.",
      "yes"
    ],
    expectedBehavior: [
      "Validate emotion before steering",
      "Avoid interrupting venting in first response",
      "Use at most one forced-choice question before closure"
    ],
    expectedExtractions: {
      past_attribution: { value: "emotional_disconnect", confidenceMin: 80, comparator: "exact" },
      conflict_speed: { value: 1, confidenceMin: 80, comparator: "exact" },
      support_need: { value: "validation", confidenceMin: 80, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 70, comparator: "one_of" },
      love_expression: { value: ["words", "time"], confidenceMin: 75, comparator: "contains_all" },
      relationship_vision: { value: "friendship", confidenceMin: 75, comparator: "exact" },
      relational_strengths: { value: ["honesty", "support"], confidenceMin: 75, comparator: "contains_all" },
      growth_intention: { value: "depth", confidenceMin: 80, comparator: "exact" }
    },
    successCriteria: [
      "No duplicate assistant lines",
      "All 8 dimensions captured",
      "No abrupt redirect in first 2 assistant turns"
    ]
  },
  {
    id: "s02_balanced_thoughtful",
    title: "Balanced thoughtful user",
    category: "openness_spectrum",
    persona: "Calm user with clear answers and moderate detail.",
    objective: "Verify happy-path extraction and natural pacing.",
    turns: [
      "yes",
      "I think my last relationship ended mostly because our long-term goals did not line up.",
      "I usually cool down a bit and then talk soon after.",
      "When stressed I want practical help first.",
      "I am open but usually after trust is there.",
      "I show love with acts and time.",
      "I want an independent partnership.",
      "I bring consistency and loyalty.",
      "I want stronger alignment this time.",
      "yes"
    ],
    expectedBehavior: ["Natural transitions", "Minimal clarifications", "No quick-mode fallback"],
    expectedExtractions: {
      past_attribution: { value: "misaligned_goals", confidenceMin: 80, comparator: "exact" },
      conflict_speed: { value: 2, confidenceMin: 75, comparator: "exact" },
      support_need: { value: "practical", confidenceMin: 75, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 70, comparator: "exact" },
      love_expression: { value: ["acts", "time"], confidenceMin: 75, comparator: "contains_all" },
      relationship_vision: { value: "independent", confidenceMin: 75, comparator: "exact" },
      relational_strengths: { value: ["consistency", "loyalty"], confidenceMin: 75, comparator: "contains_all" },
      growth_intention: { value: "alignment", confidenceMin: 80, comparator: "exact" }
    },
    successCriteria: ["Completion in <= 12 user turns", "No repeated clarification prompt"]
  },
  {
    id: "s03_guarded_short_answers",
    title: "Guarded low-effort user",
    category: "openness_spectrum",
    persona: "Short answers, low trust, low energy.",
    objective: "Verify Lucy stays warm, non-pushy, and still progresses.",
    turns: [
      "just trying this",
      "dating is exhausting",
      "emotionally unavailable people",
      "depends",
      "space then check in",
      "open with trust",
      "acts",
      "safe",
      "support",
      "peace",
      "yes"
    ],
    expectedBehavior: ["Acknowledge guarded tone", "Avoid aggressive probing", "Use concise clarifications only"],
    expectedExtractions: {
      past_attribution: { value: "emotional_disconnect", confidenceMin: 70, comparator: "exact" },
      conflict_speed: { value: 3, confidenceMin: 65, comparator: "one_of" },
      support_need: { value: "space", confidenceMin: 70, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 65, comparator: "exact" },
      love_expression: { value: ["acts"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "safe", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["support"], confidenceMin: 65, comparator: "contains_all" },
      growth_intention: { value: "peace", confidenceMin: 70, comparator: "exact" }
    },
    successCriteria: ["No frustration language from Lucy", "User reaches closing"]
  },
  {
    id: "s04_avoidant_ex_vent",
    title: "Venting about avoidant ex",
    category: "pain_point",
    persona: "Frustrated user focused on emotional unavailability from ex.",
    objective: "Verify indirect extraction from venting and reflective follow-up.",
    turns: [
      "yes",
      "My ex shut down every time things got emotional and made me feel needy for wanting basic communication.",
      "I need to actually talk through conflict.",
      "I need validation first.",
      "I am emotionally open once there is trust.",
      "Words and quality time are how I show love.",
      "I want a safe relationship with depth.",
      "I bring honesty and support.",
      "I want depth most of all.",
      "yes"
    ],
    expectedBehavior: ["Reflect pain before next question", "Extract from implication", "Avoid robotic multiple-choice jump"],
    expectedExtractions: {
      past_attribution: { value: "emotional_disconnect", confidenceMin: 80, comparator: "exact" },
      conflict_speed: { value: 1, confidenceMin: 75, comparator: "exact" },
      support_need: { value: "validation", confidenceMin: 75, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 70, comparator: "exact" },
      love_expression: { value: ["words", "time"], confidenceMin: 75, comparator: "contains_all" },
      relationship_vision: { value: "safe", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["honesty", "support"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "depth", confidenceMin: 80, comparator: "exact" }
    },
    successCriteria: ["At least one empathy phrase before redirect", "No quick-pick loop"]
  },
  {
    id: "s05_anxious_self_awareness",
    title: "User venting about own anxious patterns",
    category: "pain_point",
    persona: "Self-aware user who admits reassurance needs and anxiety.",
    objective: "Verify Lucy does not mislabel user as avoidant and captures growth intent.",
    turns: [
      "yes",
      "I get anxious and overthink, then I need reassurance and feel embarrassed about it.",
      "In conflict I try to resolve quickly.",
      "When stressed I need to feel chosen and heard.",
      "I open up fast emotionally.",
      "I show love through time and words.",
      "I want partnership that feels safe.",
      "I bring consistency and honesty.",
      "I want better balance this time.",
      "yes"
    ],
    expectedBehavior: ["No judgmental framing", "Validate self-awareness", "Capture growth focus accurately"],
    expectedExtractions: {
      past_attribution: { value: "emotional_disconnect", confidenceMin: 65, comparator: "one_of" },
      conflict_speed: { value: 1, confidenceMin: 75, comparator: "exact" },
      support_need: { value: "validation", confidenceMin: 75, comparator: "one_of" },
      emotional_openness: { value: 1, confidenceMin: 75, comparator: "exact" },
      love_expression: { value: ["time", "words"], confidenceMin: 75, comparator: "contains_all" },
      relationship_vision: { value: "safe", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["consistency", "honesty"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "balance", confidenceMin: 80, comparator: "exact" }
    },
    successCriteria: ["No contradiction loop", "Accurate emotional_openness extraction"]
  },
  {
    id: "s06_skeptical_apps",
    title: "Skeptical user frustrated with dating apps",
    category: "pain_point",
    persona: "Cynical user, low initial trust in Lucy.",
    objective: "Verify Lucy answers trust concerns and continues without derailment.",
    turns: [
      "are you actually helpful or another bot",
      "apps are all mixed intentions and no commitment",
      "I am talk-now in conflict",
      "I need practical help first",
      "I am selective with emotions",
      "acts and physical closeness",
      "shared adventure",
      "loyalty and support",
      "alignment",
      "yes"
    ],
    expectedBehavior: ["Direct trust response in one turn", "Resume onboarding smoothly", "No defensive tone"],
    expectedExtractions: {
      past_attribution: { value: "misaligned_goals", confidenceMin: 80, comparator: "exact" },
      conflict_speed: { value: 1, confidenceMin: 75, comparator: "exact" },
      support_need: { value: "practical", confidenceMin: 70, comparator: "exact" },
      emotional_openness: { value: 4, confidenceMin: 70, comparator: "exact" },
      love_expression: { value: ["acts", "physical"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "adventure", confidenceMin: 75, comparator: "exact" },
      relational_strengths: { value: ["loyalty", "support"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "alignment", confidenceMin: 80, comparator: "exact" }
    },
    successCriteria: ["No repeated trust-response loop", "No safety misfire"]
  },
  {
    id: "s07_off_topic_repeated",
    title: "Repeated off-topic diversions",
    category: "edge_case",
    persona: "Playful, distracted user that derails often.",
    objective: "Verify redirect ladder works without hostility and still completes.",
    turns: [
      "yes",
      "what is your favorite color",
      "what movie should i watch tonight",
      "who made you",
      "fine, the issue was bad communication",
      "2",
      "validation",
      "2",
      "acts and words",
      "friendship",
      "consistency and support",
      "peace",
      "yes"
    ],
    expectedBehavior: ["Soft then firmer redirects", "No repetitive redirect sentence", "Return to onboarding flow"],
    expectedExtractions: {
      past_attribution: { value: "conflict_comm", confidenceMin: 75, comparator: "exact" },
      conflict_speed: { value: 2, confidenceMin: 75, comparator: "exact" },
      support_need: { value: "validation", confidenceMin: 75, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 70, comparator: "exact" },
      love_expression: { value: ["acts", "words"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "friendship", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["consistency", "support"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "peace", confidenceMin: 75, comparator: "exact" }
    },
    successCriteria: ["At least one redirect message", "No hard loop after redirects"]
  },
  {
    id: "s08_contradictory_answers",
    title: "Contradictory self-report answers",
    category: "edge_case",
    persona: "User gives conflicting conflict/support statements.",
    objective: "Verify contradiction handling and one-time reconciliation prompt.",
    turns: [
      "yes",
      "communication breakdown was the issue",
      "I resolve everything immediately",
      "Actually I usually need days of space",
      "I am very open",
      "words and time",
      "safe",
      "honesty and consistency",
      "peace",
      "yes"
    ],
    expectedBehavior: ["One reconciliation prompt maximum", "No contradiction loop", "Continue after clarification"],
    expectedExtractions: {
      past_attribution: { value: "conflict_comm", confidenceMin: 75, comparator: "exact" },
      conflict_speed: { value: [1, 5, 3], confidenceMin: 60, comparator: "one_of" },
      support_need: { value: "space", confidenceMin: 60, comparator: "one_of" },
      emotional_openness: { value: 1, confidenceMin: 70, comparator: "exact" },
      love_expression: { value: ["words", "time"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "safe", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["honesty", "consistency"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "peace", confidenceMin: 70, comparator: "exact" }
    },
    successCriteria: ["At most 1 contradiction clarification", "Progress continues"]
  },
  {
    id: "s09_hostile_user",
    title: "Hostile and rude tone user",
    category: "edge_case",
    persona: "Irritated user, short rude messages.",
    objective: "Verify neutral boundary handling without escalation.",
    turns: [
      "yes",
      "this is stupid",
      "whatever, people had no commitment",
      "1",
      "space",
      "4",
      "acts",
      "independent",
      "loyalty and support",
      "alignment",
      "yes"
    ],
    expectedBehavior: ["Firm but calm boundary", "No therapist lecture", "No defensive tone"],
    expectedExtractions: {
      past_attribution: { value: "misaligned_goals", confidenceMin: 70, comparator: "exact" },
      conflict_speed: { value: 1, confidenceMin: 75, comparator: "exact" },
      support_need: { value: "space", confidenceMin: 70, comparator: "exact" },
      emotional_openness: { value: 4, confidenceMin: 70, comparator: "exact" },
      love_expression: { value: ["acts"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "independent", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["loyalty", "support"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "alignment", confidenceMin: 70, comparator: "exact" }
    },
    successCriteria: ["No safety false-positive", "No repeated hostility redirect loop"]
  },
  {
    id: "s10_conflict_speed_precision",
    title: "Conflict-speed precision test",
    category: "dimension_focus",
    persona: "User gives nuanced conflict style answer.",
    objective: "Verify conflict_speed extraction from mixed phrasing.",
    turns: [
      "yes",
      "our issue was poor communication",
      "I need maybe 30 minutes then I want to resolve quickly",
      "practical help first",
      "open with trust",
      "acts and time",
      "independent",
      "consistency and honesty",
      "balance",
      "yes"
    ],
    expectedBehavior: ["Use clarification once if needed", "No jump to 5/5 from weak evidence"],
    expectedExtractions: {
      past_attribution: { value: "conflict_comm", confidenceMin: 75, comparator: "exact" },
      conflict_speed: { value: 2, confidenceMin: 70, comparator: "one_of" },
      support_need: { value: "practical", confidenceMin: 70, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 65, comparator: "exact" },
      love_expression: { value: ["acts", "time"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "independent", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["consistency", "honesty"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "balance", confidenceMin: 75, comparator: "exact" }
    },
    successCriteria: ["Conflict extraction within expected range", "No confirmation loop"]
  },
  {
    id: "s11_emotional_openness_precision",
    title: "Emotional openness extraction test",
    category: "dimension_focus",
    persona: "User gives nuanced openness statement with trust caveat.",
    objective: "Verify Lucy maps nuanced openness to 2-3 instead of extreme labels.",
    turns: [
      "yes",
      "last relationship had emotional distance",
      "I usually talk pretty quickly in conflict",
      "validation first",
      "I am private at first but open once trust is established",
      "words and time",
      "safe",
      "support and honesty",
      "depth",
      "yes"
    ],
    expectedBehavior: ["Explain scale if asked", "Avoid opaque numeric phrasing loop"],
    expectedExtractions: {
      past_attribution: { value: "emotional_disconnect", confidenceMin: 75, comparator: "exact" },
      conflict_speed: { value: 2, confidenceMin: 70, comparator: "one_of" },
      support_need: { value: "validation", confidenceMin: 70, comparator: "exact" },
      emotional_openness: { value: [2, 3], confidenceMin: 70, comparator: "one_of" },
      love_expression: { value: ["words", "time"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "safe", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["support", "honesty"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "depth", confidenceMin: 75, comparator: "exact" }
    },
    successCriteria: ["No repeated `X/5 keep this?` loop", "Openness mapped to middle range"]
  },
  {
    id: "s12_relationship_vision_nuance",
    title: "Relationship vision nuance extraction",
    category: "dimension_focus",
    persona: "User wants both independence and adventure.",
    objective: "Verify nuanced vision capture without forcing wrong binary.",
    turns: [
      "yes",
      "we wanted different things long term",
      "depends",
      "presence first",
      "open with trust",
      "acts and physical",
      "I want independence but shared adventure",
      "consistency and joy",
      "alignment",
      "yes"
    ],
    expectedBehavior: ["Natural clarification for nuanced vision", "Avoid flattening nuance to unrelated category"],
    expectedExtractions: {
      past_attribution: { value: "misaligned_goals", confidenceMin: 75, comparator: "exact" },
      conflict_speed: { value: 3, confidenceMin: 65, comparator: "exact" },
      support_need: { value: "presence", confidenceMin: 65, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 60, comparator: "one_of" },
      love_expression: { value: ["acts", "physical"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: ["independent", "adventure"], confidenceMin: 70, comparator: "one_of" },
      relational_strengths: { value: ["consistency", "joy"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "alignment", confidenceMin: 75, comparator: "exact" }
    },
    successCriteria: ["Vision maps to one expected nuanced category", "No hard forced-choice loop"]
  },
  {
    id: "s13_warm_tone_consistency",
    title: "Warm-tone consistency check",
    category: "quality",
    persona: "Emotionally open user expecting warm interaction.",
    objective: "Verify Lucy remains warm and non-clinical through full flow.",
    turns: [
      "yes",
      "I feel hopeful but cautious after getting hurt by mixed intentions.",
      "I like to resolve things quickly with calm communication.",
      "Being heard first helps me most.",
      "I am open once trust is there.",
      "I show love through words and acts.",
      "I want safe stability with fun.",
      "I bring consistency and support.",
      "I want peace and alignment.",
      "yes"
    ],
    expectedBehavior: ["Warm phrasing throughout", "No clinical/rigid wording clusters"],
    expectedExtractions: {
      past_attribution: { value: "misaligned_goals", confidenceMin: 70, comparator: "exact" },
      conflict_speed: { value: 1, confidenceMin: 70, comparator: "one_of" },
      support_need: { value: "validation", confidenceMin: 70, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 65, comparator: "exact" },
      love_expression: { value: ["words", "acts"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "safe", confidenceMin: 65, comparator: "exact" },
      relational_strengths: { value: ["consistency", "support"], confidenceMin: 65, comparator: "contains_all" },
      growth_intention: { value: ["peace", "alignment"], confidenceMin: 70, comparator: "one_of" }
    },
    successCriteria: ["Personality score >= 4", "Naturalness score >= 4"]
  },
  {
    id: "s14_validate_before_redirect",
    title: "Validation before redirect quality check",
    category: "quality",
    persona: "User vents briefly then needs topic shift.",
    objective: "Verify Lucy validates before steering to next dimension.",
    turns: [
      "yes",
      "I am tired of flaky people and being breadcrumbed.",
      "I just want someone serious and reliable.",
      "I resolve conflict quickly.",
      "validation first",
      "open with trust",
      "time and acts",
      "friendship",
      "honesty and support",
      "chosen",
      "yes"
    ],
    expectedBehavior: ["Validation line appears before forced redirect", "No abrupt `different angle` after vent without acknowledgment"],
    expectedExtractions: {
      past_attribution: { value: "misaligned_goals", confidenceMin: 75, comparator: "exact" },
      conflict_speed: { value: 1, confidenceMin: 75, comparator: "exact" },
      support_need: { value: "validation", confidenceMin: 70, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 60, comparator: "exact" },
      love_expression: { value: ["time", "acts"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "friendship", confidenceMin: 65, comparator: "exact" },
      relational_strengths: { value: ["honesty", "support"], confidenceMin: 65, comparator: "contains_all" },
      growth_intention: { value: "chosen", confidenceMin: 75, comparator: "exact" }
    },
    successCriteria: ["Validation occurs in first response to venting turn"]
  },
  {
    id: "s15_vent_without_rushing",
    title: "Venting without rushed interruption",
    category: "quality",
    persona: "User sends heavy vent, expects Lucy to hold space briefly.",
    objective: "Verify Lucy allows at least one deepening response before narrowing to options.",
    turns: [
      "yes",
      "My ex was emotionally unavailable and then blamed me for wanting normal communication. It really messed with my confidence.",
      "I needed direct conversations right away, not days of silence.",
      "I needed validation and reassurance first.",
      "I open up once I feel safe.",
      "words and time",
      "safe partnership",
      "honesty and consistency",
      "depth",
      "yes"
    ],
    expectedBehavior: ["Hold-space response before checklist question", "No immediate forced-option list after vent"],
    expectedExtractions: {
      past_attribution: { value: "emotional_disconnect", confidenceMin: 80, comparator: "exact" },
      conflict_speed: { value: 1, confidenceMin: 75, comparator: "exact" },
      support_need: { value: "validation", confidenceMin: 75, comparator: "exact" },
      emotional_openness: { value: 2, confidenceMin: 70, comparator: "exact" },
      love_expression: { value: ["words", "time"], confidenceMin: 70, comparator: "contains_all" },
      relationship_vision: { value: "safe", confidenceMin: 70, comparator: "exact" },
      relational_strengths: { value: ["honesty", "consistency"], confidenceMin: 70, comparator: "contains_all" },
      growth_intention: { value: "depth", confidenceMin: 80, comparator: "exact" }
    },
    successCriteria: ["At least one reflective line before narrowing questions", "No repeated question loop"]
  }
];
