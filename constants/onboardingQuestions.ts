import type {
  ConflictSpeed,
  EmotionalOpenness,
  GrowthIntention,
  LoveExpression,
  PastAttribution,
  RelationshipVision,
  RelationalStrength,
  SupportNeed
} from "@/lib/compatibility";

export type LifestyleEnergy =
  | "introspective"
  | "high_energy"
  | "social"
  | "intellectual"
  | "spontaneous";

type OnboardingQuestionValueById = {
  past_attribution: PastAttribution;
  conflict_speed: ConflictSpeed;
  love_expression: LoveExpression;
  support_need: SupportNeed;
  emotional_openness: EmotionalOpenness;
  relationship_vision: RelationshipVision;
  relational_strengths: RelationalStrength;
  growth_intention: GrowthIntention;
  lifestyle_energy: LifestyleEnergy;
};

export type OnboardingQuestionId = keyof OnboardingQuestionValueById;
export type OnboardingQuestionType = "cards" | "spectrum" | "rank";

export type OnboardingQuestionOption<T extends string | number> = {
  label: string;
  desc: string;
  value: T;
};

export type OnboardingQuestionDef<TId extends OnboardingQuestionId> = {
  id: TId;
  dimension: string;
  dimensionColor: string;
  prompt: string;
  question: string;
  type: OnboardingQuestionType;
  options: Array<OnboardingQuestionOption<OnboardingQuestionValueById[TId]>>;
  leftLabel?: string;
  rightLabel?: string;
  instruction?: string;
  maxSelect?: number;
  insight: string;
  isBonus?: boolean;
};

export const onboardingQuestions = [
  {
    id: "past_attribution",
    dimension: "Past Reflection",
    dimensionColor: "#C4865A",
    prompt: "Let's start with some reflection.",
    question: "When a past relationship ended, what do you feel was the core issue?",
    type: "cards",
    options: [
      { label: "Different directions", desc: "We wanted different things long-term", value: "misaligned_goals" },
      { label: "Communication", desc: "We struggled to talk through conflict", value: "conflict_comm" },
      { label: "Emotional distance", desc: "I felt unseen or disconnected", value: "emotional_disconnect" },
      { label: "Need for space", desc: "I needed more independence", value: "autonomy" },
      { label: "Timing & life", desc: "External circumstances got in the way", value: "external" }
    ],
    insight: "This reveals how you interpret your past — a window into growth and self-awareness."
  },
  {
    id: "conflict_speed",
    dimension: "Conflict Style",
    dimensionColor: "#D4607A",
    prompt: "No relationship is conflict-free.",
    question: "In a disagreement with someone you love, what do you tend to do first?",
    type: "spectrum",
    leftLabel: "Talk it through immediately",
    rightLabel: "Need space to process first",
    options: [
      { label: "Talk now", value: 1, desc: "I want to resolve things in the moment" },
      { label: "Lean in", value: 2, desc: "I engage fairly quickly but warm up first" },
      { label: "Middle path", value: 3, desc: "Depends on the situation and my energy" },
      { label: "Step back", value: 4, desc: "I usually need a beat before I can engage well" },
      { label: "Space first", value: 5, desc: "I need significant time alone before I can talk" }
    ],
    insight: "Conflict style compatibility is one of the strongest predictors of relationship success."
  },
  {
    id: "love_expression",
    dimension: "Love Expression",
    dimensionColor: "#A06BB8",
    prompt: "Love shows up differently for everyone.",
    question: "How do you naturally express love to someone you care about?",
    type: "rank",
    options: [
      { label: "Acts of care", desc: "Doing things to make their life easier", value: "acts" },
      { label: "Quality presence", desc: "Full, undivided attention and time", value: "time" },
      { label: "Words & affirmation", desc: "Saying exactly how I feel, often", value: "words" },
      { label: "Physical closeness", desc: "Touch, warmth, physical presence", value: "physical" },
      { label: "Thoughtful surprises", desc: "Gestures that show I was thinking of them", value: "gifts" }
    ],
    instruction: "Pick your top 2",
    maxSelect: 2,
    insight: "We match on expression patterns and emotional responsiveness, not just language labels."
  },
  {
    id: "support_need",
    dimension: "Support Needs",
    dimensionColor: "#5A8FC4",
    prompt: "Hard times reveal everything.",
    question: "When you're stressed or going through something hard, what do you need from a partner?",
    type: "cards",
    options: [
      { label: "Just listen", desc: "I need to feel heard, not fixed", value: "validation" },
      { label: "Help me solve it", desc: "Take something off my plate", value: "practical" },
      { label: "Be close", desc: "Physical presence and warmth", value: "presence" },
      { label: "Give me space", desc: "Then gently check in later", value: "space" },
      { label: "Distract me", desc: "Help me get out of my head", value: "distraction" }
    ],
    insight: "Support style mismatch breaks couples who deeply love each other."
  },
  {
    id: "emotional_openness",
    dimension: "Emotional Openness",
    dimensionColor: "#6BA89E",
    prompt: "This one takes honesty.",
    question: "How comfortable are you with emotional vulnerability in a relationship?",
    type: "spectrum",
    leftLabel: "Very open — I share deeply",
    rightLabel: "More private — I keep things close",
    options: [
      { label: "Very open", value: 1, desc: "I share naturally and crave emotional depth" },
      { label: "Open with trust", value: 2, desc: "I open up slowly but fully once safe" },
      { label: "Working on it", value: 3, desc: "I want more openness than comes naturally" },
      { label: "Selective", value: 4, desc: "I'm private but can open up with the right person" },
      { label: "Self-contained", value: 5, desc: "I prefer to manage most emotions internally" }
    ],
    insight: "Emotional availability explains more relationship satisfaction than any other single factor."
  },
  {
    id: "relationship_vision",
    dimension: "Relationship Vision",
    dimensionColor: "#C4A85A",
    prompt: "Let's talk about what you're actually building.",
    question: "What does a truly healthy relationship look like to you in everyday life?",
    type: "cards",
    options: [
      { label: "Independent together", desc: "Two whole people who actively choose each other", value: "independent" },
      { label: "Deeply intertwined", desc: "Each other's anchor through everything", value: "enmeshed" },
      { label: "Best friendship", desc: "Deep friendship with romantic depth", value: "friendship" },
      { label: "Safe harbour", desc: "A calm, peaceful space from the world", value: "safe" },
      { label: "Shared adventure", desc: "Growing, building, exploring together", value: "adventure" }
    ],
    insight: "Goal alignment predicts relationship success above personality compatibility."
  },
  {
    id: "relational_strengths",
    dimension: "Self-Awareness",
    dimensionColor: "#8FA65A",
    prompt: "Give yourself some credit.",
    question: "Looking back, what did you bring to past relationships that you're genuinely proud of?",
    type: "rank",
    options: [
      { label: "Consistency", desc: "I show up and follow through", value: "consistency" },
      { label: "Loyalty", desc: "People feel safe and secure with me", value: "loyalty" },
      { label: "Honesty", desc: "I communicate openly, even when it's hard", value: "honesty" },
      { label: "Joy", desc: "I bring lightness, laughter, and spontaneity", value: "joy" },
      { label: "Championing", desc: "I cheer for people's growth and dreams", value: "support" }
    ],
    instruction: "Pick your top 2",
    maxSelect: 2,
    insight: "Self-compassion is a significant predictor of relationship quality for both partners."
  },
  {
    id: "growth_intention",
    dimension: "Growth Intention",
    dimensionColor: "#B86B8A",
    prompt: "Almost there. This one matters most.",
    question: "What's the one thing you most want to be different in your next relationship?",
    type: "cards",
    options: [
      { label: "Deeper honesty", desc: "More emotional depth and real communication", value: "depth" },
      { label: "Better balance", desc: "Togetherness and personal space in harmony", value: "balance" },
      { label: "Being chosen", desc: "A partner who actively picks me, consistently", value: "chosen" },
      { label: "Less conflict", desc: "More calm, more mutual respect", value: "peace" },
      { label: "Real alignment", desc: "Same vision for life and what we're building", value: "alignment" }
    ],
    insight: "This is your growth signal — it tells us exactly what you've learned and what you're ready for."
  },
  {
    id: "lifestyle_energy",
    dimension: "Lifestyle",
    dimensionColor: "#C4865A",
    prompt: "One more — this one's just for fun.",
    question: "If your ideal Saturday night was a movie genre, what would it be?",
    type: "cards",
    options: [
      { label: "Quiet indie film", desc: "Calm, introspective, small gathering", value: "introspective" },
      { label: "Action blockbuster", desc: "High energy, excitement, stimulation", value: "high_energy" },
      { label: "Rom-com marathon", desc: "Lighthearted, social, laughter-filled", value: "social" },
      { label: "Documentary deep-dive", desc: "Curious, learning-focused, engaged", value: "intellectual" },
      { label: "Whatever's playing", desc: "Spontaneous, go-with-the-flow, adaptable", value: "spontaneous" }
    ],
    insight: "This helps us match you with people whose energy level fits yours.",
    isBonus: true
  }
] satisfies Array<OnboardingQuestionDef<OnboardingQuestionId>>;

