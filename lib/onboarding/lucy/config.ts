import type { LucyAnswerField, LucyOption, LucyStageId } from "@/lib/onboarding/lucy/types";

export const LUCY_STAGE_ORDER: LucyStageId[] = [
  "opening",
  "past_attribution",
  "conflict_speed",
  "support_need",
  "emotional_openness",
  "love_expression",
  "relationship_vision",
  "relational_strengths",
  "growth_intention",
  "closing"
];

export const FLEX_BLOCK_A: LucyStageId[] = ["support_need", "emotional_openness", "love_expression"];
export const FLEX_BLOCK_B: LucyStageId[] = ["relationship_vision", "relational_strengths"];

export const REQUIRED_STAGE_FIELDS: Record<LucyStageId, LucyAnswerField | null> = {
  opening: null,
  past_attribution: "past_attribution",
  conflict_speed: "conflict_speed",
  support_need: "support_need",
  emotional_openness: "emotional_openness",
  love_expression: "love_expression",
  relationship_vision: "relationship_vision",
  relational_strengths: "relational_strengths",
  growth_intention: "growth_intention",
  closing: null
};

export const STAGE_LABELS: Record<LucyStageId, string> = {
  opening: "Opening",
  past_attribution: "Past Reflection",
  conflict_speed: "Conflict Style",
  support_need: "Support Needs",
  emotional_openness: "Emotional Openness",
  love_expression: "Love Expression",
  relationship_vision: "Relationship Vision",
  relational_strengths: "Relational Strengths",
  growth_intention: "Growth Intention",
  closing: "Summary"
};

export const STAGE_TIME_BUDGET_SECONDS: Record<LucyStageId, { min: number; max: number }> = {
  opening: { min: 45, max: 90 },
  past_attribution: { min: 60, max: 120 },
  conflict_speed: { min: 60, max: 90 },
  support_need: { min: 45, max: 75 },
  emotional_openness: { min: 45, max: 75 },
  love_expression: { min: 60, max: 90 },
  relationship_vision: { min: 60, max: 90 },
  relational_strengths: { min: 60, max: 90 },
  growth_intention: { min: 60, max: 90 },
  closing: { min: 30, max: 60 }
};

export const MAX_EXCHANGES_PER_STAGE: Partial<Record<LucyStageId, number>> = {
  opening: 3,
  past_attribution: 3,
  conflict_speed: 3,
  support_need: 2,
  emotional_openness: 2,
  love_expression: 3,
  relationship_vision: 3,
  relational_strengths: 3,
  growth_intention: 2,
  closing: 3
};

export const OPENING_MESSAGES = [
  "I’m Lucy, your dating coach. How are you feeling about dating right now?",
  "I’m Lucy, your dating coach. What’s been the hardest part lately?",
  "I’m Lucy, your dating coach. Want to start with what happened last time, or what you want now?"
];

export const STAGE_PROMPTS: Record<LucyStageId, string[]> = {
  opening: OPENING_MESSAGES,
  past_attribution: [
    "When a past relationship ended, what felt like the core issue?",
    "Looking back, what usually went wrong in past relationships?",
    "What felt most missing for you in your last relationship?"
  ],
  conflict_speed: [
    "In a disagreement, do you want to resolve it right away or step back first?",
    "When conflict hits, what is your first move?",
    "Are you more talk-now, cool-off, or depends?"
  ],
  support_need: [
    "When you’re overwhelmed, what helps most: being heard, practical help, closeness, space, or distraction?",
    "If your week is rough, what should your partner do first?",
    "What support style makes you feel most cared for?"
  ],
  emotional_openness: [
    "How comfortable are you sharing deeper emotions with a partner?",
    "Do you open up quickly, gradually, or keep things mostly private?",
    "On emotional depth, where do you naturally sit?"
  ],
  love_expression: [
    "How do you naturally show love: acts, time, words, physical closeness, or thoughtful gifts?",
    "What does your care look like day to day?",
    "If your partner felt loved by you, what did you probably do?"
  ],
  relationship_vision: [
    "What does a healthy relationship look like in everyday life?",
    "Is your ideal more independent, deeply intertwined, best-friend energy, safe harbor, or shared adventure?",
    "What kind of togetherness feels right to you?"
  ],
  relational_strengths: [
    "What are you genuinely proud of in how you show up in relationships?",
    "If past partners described your strengths, what would they say?",
    "What do people feel from you when things are hard?"
  ],
  growth_intention: [
    "What one shift matters most in your next relationship?",
    "If this next chapter goes well, what is different from before?",
    "Which matters most now: deeper honesty, better balance, being chosen, less conflict, or stronger alignment?"
  ],
  closing: [
    "I have what I need to summarize your compatibility profile.",
    "Anything you want to change before I lock this in?",
    "Once confirmed, I’ll move you to profile setup and matching."
  ]
};

export const STAGE_TRANSITIONS: Record<LucyStageId, string | null> = {
  opening: "Perfect. First, I want to understand what you learned from your last relationship.",
  past_attribution: "That helps. When tension starts in a relationship, what do you usually do first?",
  conflict_speed: "Got it. When you’re stressed, what support feels best from a partner?",
  support_need: "Useful. How easy is emotional vulnerability for you in relationships?",
  emotional_openness: "Thanks. I also want to understand how you naturally show love.",
  love_expression: "Great. Now let’s map what a healthy relationship looks like to you.",
  relationship_vision: "I like that clarity. Looking back, what strengths do you bring to relationships?",
  relational_strengths: "Last core one. What do you most want to be different next time?",
  growth_intention: "Perfect. I have enough to summarize your compatibility profile.",
  closing: null
};

export const QUICK_OPTIONS: Record<LucyAnswerField, LucyOption[]> = {
  past_attribution: [
    { value: "misaligned_goals", label: "Different directions", hint: "Wanted different things long term" },
    { value: "conflict_comm", label: "Communication issues", hint: "Could not repair conflict well" },
    { value: "emotional_disconnect", label: "Emotional distance", hint: "Felt unseen or disconnected" },
    { value: "autonomy", label: "Need for space", hint: "Needed more independence" },
    { value: "external", label: "External timing", hint: "Life circumstances got in the way" }
  ],
  conflict_speed: [
    { value: "1", label: "1 · Talk now", hint: "Resolve immediately" },
    { value: "2", label: "2 · Lean in soon", hint: "Quick but not instant" },
    { value: "3", label: "3 · Depends", hint: "Situational" },
    { value: "4", label: "4 · Step back", hint: "Need some time first" },
    { value: "5", label: "5 · Space first", hint: "Need significant time first" }
  ],
  support_need: [
    { value: "validation", label: "Being heard" },
    { value: "practical", label: "Practical help" },
    { value: "presence", label: "Physical closeness" },
    { value: "space", label: "Space first" },
    { value: "distraction", label: "Healthy distraction" }
  ],
  emotional_openness: [
    { value: "1", label: "1 · Very open" },
    { value: "2", label: "2 · Open with trust" },
    { value: "3", label: "3 · Mixed" },
    { value: "4", label: "4 · Selective/private" },
    { value: "5", label: "5 · Mostly private" }
  ],
  love_expression: [
    { value: "acts", label: "Acts of care" },
    { value: "time", label: "Quality time" },
    { value: "words", label: "Words and affirmation" },
    { value: "physical", label: "Physical closeness" },
    { value: "gifts", label: "Thoughtful gifts" }
  ],
  relationship_vision: [
    { value: "independent", label: "Independent together" },
    { value: "enmeshed", label: "Deeply intertwined" },
    { value: "friendship", label: "Best-friend foundation" },
    { value: "safe", label: "Safe and stable" },
    { value: "adventure", label: "Shared adventure" }
  ],
  relational_strengths: [
    { value: "consistency", label: "Consistency" },
    { value: "loyalty", label: "Loyalty" },
    { value: "honesty", label: "Honesty" },
    { value: "joy", label: "Joy" },
    { value: "support", label: "Support/championing" }
  ],
  growth_intention: [
    { value: "depth", label: "Deeper honesty" },
    { value: "balance", label: "Better balance" },
    { value: "chosen", label: "Being chosen consistently" },
    { value: "peace", label: "Less conflict, more calm" },
    { value: "alignment", label: "Real alignment" }
  ]
};

export const CONFLICT_SPEED_LABELS: Record<number, string> = {
  1: "talk now",
  2: "lean in soon",
  3: "depends",
  4: "step back first",
  5: "space first"
};

export const EMOTIONAL_OPENNESS_LABELS: Record<number, string> = {
  1: "very open",
  2: "open with trust",
  3: "mixed",
  4: "selective/private",
  5: "mostly private"
};

export const TRUST_QUESTION_KEYWORDS = [
  "trust",
  "safe",
  "private",
  "privacy",
  "data",
  "real",
  "human",
  "bot"
];

export const LOW_COMMITMENT_KEYWORDS = ["browsing", "just looking", "not sure", "just checking", "maybe later"];

export const SAFETY_KEYWORDS = {
  self_harm: ["kill myself", "self harm", "suicide", "want to die", "hurt myself"],
  threat: ["kill them", "hurt them", "violence", "attack", "shoot"],
  hate: ["racial slur", "hate", "nazi", "terrorist"]
};
