import type { OffTopicCategory, RedirectPolicy, ResponseTier } from "@/lib/onboarding/lucy/types";

const TESTING_KEYWORDS = ["are you real", "favorite color", "favourite color", "bot", "human or ai", "who made you"];
const FLIRTING_KEYWORDS = ["date you", "marry you", "hot", "sexy", "love you lucy", "kiss"];
const ADVICE_KEYWORDS = ["should i", "what should i do", "text my ex", "advice"];
const META_KEYWORDS = ["how does this app work", "how this works", "data private", "privacy", "why should i trust"];
const HOSTILITY_KEYWORDS = ["stupid", "fuck this", "idiot", "dumb app", "shut up"];
const VENTING_MARKERS = ["my ex", "they were", "toxic", "he did", "she did", "for years"];

const VAGUE_PATTERNS = [
  /\bidk\b/i,
  /\bi don't know\b/i,
  /\bit'?s complicated\b/i,
  /\ball of the above\b/i,
  /\bdepends\b/i
];

const AFFIRMATIVE_PATTERNS = [
  /\byes\b/i,
  /\byeah\b/i,
  /\byep\b/i,
  /\blooks good\b/i,
  /\bconfirm\b/i,
  /\bcorrect\b/i,
  /\bdone\b/i
];

const EDIT_PATTERNS = [/\bchange\b/i, /\bedit\b/i, /\bupdate\b/i, /\bmodify\b/i, /\bgo back\b/i];
const CLARIFICATION_QUESTION_PATTERNS = [
  /\bwhat does that mean\b/i,
  /\bout of what\b/i,
  /\bwhat do you mean\b/i,
  /\bwhat is that\b/i,
  /\bhow do you mean\b/i
];
const META_TERM_PATTERNS = [
  /\bout of\s*5\b/i,
  /\bout of what\b/i,
  /\bwhat does\b.*\bmean\b/i,
  /\bwhat is\b.*\bscale\b/i,
  /\bwhat is\b.*\bopenness\b/i
];
const UNCERTAIN_ANSWER_PATTERNS = [
  /\bidk\b/i,
  /\bi don't know\b/i,
  /\bnot sure\b/i,
  /\bmaybe\b/i,
  /\bdepends\b/i,
  /\bhard to say\b/i
];
const INTERPRETATION_CHALLENGE_PATTERNS = [
  /\bjump(ed)? to (that )?conclusion\b/i,
  /\bhow did you (get|infer|decide)\b/i,
  /\bwhere did you get that\b/i,
  /\bhow did you get there\b/i,
  /\bthat'?s not what i said\b/i,
  /\bi never said\b/i,
  /\byou said that\b/i,
  /\byou did\b/i,
  /\bi didn'?t say that\b/i,
  /\bthat is not what i meant\b/i
];
const EXTERNAL_CAPABILITY_PATTERNS = [
  /\b(go to|open|visit)\s+(amazon|google|instagram|tiktok|youtube|netflix)\b/i,
  /\b(book|buy|purchase|order)\b/i,
  /\b(send|write)\s+(an )?(email|message|dm)\b/i,
  /\bcall\b/i
];
const HIGH_EMOTION_PATTERNS = [
  /\btrauma\b/i,
  /\babus(e|ive)\b/i,
  /\bpanic\b/i,
  /\banxious\b/i,
  /\bdevastat(ed|ing)\b/i,
  /\bheartbroken\b/i,
  /\bshattered\b/i,
  /\bworthless\b/i,
  /\bcan't stop (crying|thinking)\b/i,
  /\bso alone\b/i,
  /\btrigger(ed|ing)\b/i,
  /\bspiral(ing)?\b/i
];

export function normalizeText(input: string): string {
  return input.trim().toLowerCase();
}

export function containsAny(text: string, keywords: string[]): boolean {
  return keywords.some((entry) => text.includes(entry));
}

export function detectOffTopicCategory(rawInput: string): OffTopicCategory | null {
  const text = normalizeText(rawInput);
  if (!text) return null;
  if (containsAny(text, HOSTILITY_KEYWORDS)) return "hostility";
  if (containsAny(text, FLIRTING_KEYWORDS)) return "flirting";
  if (containsAny(text, TESTING_KEYWORDS)) return "testing_lucy";
  if (containsAny(text, ADVICE_KEYWORDS)) return "advice_request";
  if (containsAny(text, META_KEYWORDS)) return "meta_question";
  if (containsAny(text, VENTING_MARKERS) || text.length > 280) return "venting";
  return null;
}

export function detectSafetyType(rawInput: string): "self_harm" | "threat" | "hate" | null {
  const text = normalizeText(rawInput);
  const selfHarm = ["kill myself", "suicide", "want to die", "hurt myself", "self harm"];
  const threats = ["kill them", "hurt them", "attack", "shoot"];
  const hate = ["slur", "racial", "nazi"];

  if (containsAny(text, selfHarm)) return "self_harm";
  if (containsAny(text, threats)) return "threat";
  if (containsAny(text, hate)) return "hate";
  return null;
}

export function detectVagueResponse(rawInput: string): "idk" | "complicated" | "all_of_above" | "depends" | null {
  const text = rawInput.trim();
  if (!text) return "idk";
  if (/\bidk\b/i.test(text) || /\bi don't know\b/i.test(text)) return "idk";
  if (/\bit'?s complicated\b/i.test(text)) return "complicated";
  if (/\ball of the above\b/i.test(text)) return "all_of_above";
  if (/\bdepends\b/i.test(text)) return "depends";
  if (VAGUE_PATTERNS.some((pattern) => pattern.test(text))) return "complicated";
  return null;
}

export function buildRedirectPolicy(offTopicTotal: number, offTopicConsecutive: number, category: OffTopicCategory): RedirectPolicy {
  const response_tier: ResponseTier =
    offTopicConsecutive >= 4 ? "escape_hatch" : offTopicConsecutive >= 2 ? "firm" : offTopicConsecutive === 1 ? "medium" : "soft";
  return {
    off_topic_total: offTopicTotal,
    off_topic_consecutive: offTopicConsecutive,
    category,
    response_tier
  };
}

export function getRedirectResponse(policy: RedirectPolicy): string {
  if (policy.response_tier === "escape_hatch") {
    return "This format might not be your thing. Want to switch to quick questions so we can finish faster?";
  }
  if (policy.response_tier === "firm") {
    return "I hear you. To keep this useful, I need this one answer before we continue.";
  }
  if (policy.response_tier === "medium") {
    return "I want to come back to that. Let’s finish this section first.";
  }
  return "Good question. Quick one from me first so I can finish your profile.";
}

export function isAffirmative(rawInput: string): boolean {
  return AFFIRMATIVE_PATTERNS.some((pattern) => pattern.test(rawInput));
}

export function isEditIntent(rawInput: string): boolean {
  return EDIT_PATTERNS.some((pattern) => pattern.test(rawInput));
}

export function isClarificationQuestion(rawInput: string): boolean {
  const text = rawInput.trim();
  if (!text) return false;
  if (CLARIFICATION_QUESTION_PATTERNS.some((pattern) => pattern.test(text))) return true;
  if (text.includes("?") && /\b(what|how|why|mean|explain)\b/i.test(text)) return true;
  return false;
}

export function isMetaQuestionAboutTerm(rawInput: string): boolean {
  const text = rawInput.trim();
  if (!text) return false;
  return META_TERM_PATTERNS.some((pattern) => pattern.test(text));
}

export function isUncertainAnswer(rawInput: string): boolean {
  const text = rawInput.trim();
  if (!text) return true;
  return UNCERTAIN_ANSWER_PATTERNS.some((pattern) => pattern.test(text));
}

export function isInterpretationChallenge(rawInput: string): boolean {
  const text = rawInput.trim();
  if (!text) return false;
  return INTERPRETATION_CHALLENGE_PATTERNS.some((pattern) => pattern.test(text));
}

export function isExternalCapabilityRequest(rawInput: string): boolean {
  const text = rawInput.trim();
  if (!text) return false;
  return EXTERNAL_CAPABILITY_PATTERNS.some((pattern) => pattern.test(text));
}

export function detectHighEmotionCue(rawInput: string): boolean {
  const text = rawInput.trim();
  if (!text) return false;
  return HIGH_EMOTION_PATTERNS.some((pattern) => pattern.test(text));
}

export function parseStageSelection(rawInput: string): number | null {
  const byDigit = rawInput.match(/\b([1-8])\b/);
  if (byDigit) return Number(byDigit[1]);

  const text = normalizeText(rawInput);
  const map: Record<string, number> = {
    past: 1,
    conflict: 2,
    support: 3,
    emotional: 4,
    love: 5,
    vision: 6,
    strengths: 7,
    growth: 8
  };
  const hit = Object.entries(map).find(([keyword]) => text.includes(keyword));
  return hit ? hit[1] : null;
}
