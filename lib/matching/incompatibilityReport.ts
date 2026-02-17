export type MatchChallenge = {
  issue: string;
  explanation: string;
  script: string;
};

export type IncompatibilityReport = {
  matchName: string;
  score: number;
  whatWillFeelEasy: string[];
  whatWillTakeWork: MatchChallenge[];
};

export type CompatibilityProfileForReport = {
  conflict_speed?: number;
  emotional_openness?: number;
  support_need?: string;
  relationship_vision?: string;
};

function visionLabel(vision: string): string {
  if (vision === "independent") return "a relationship where two whole people actively choose each other";
  if (vision === "enmeshed") return "a deeply intertwined partnership where you're each other's anchor";
  if (vision === "friendship") return "a relationship that feels like best friendship with romantic depth";
  if (vision === "safe") return "a calm, peaceful relationship that feels like a safe space";
  return "a shared adventure where you're growing and building together";
}

export function generateIncompatibilityReport(
  current: CompatibilityProfileForReport | null,
  candidate: CompatibilityProfileForReport | null,
  matchName: string,
  score: number
): IncompatibilityReport | null {
  if (!current || !candidate) {
    return null;
  }

  const easy: string[] = [];
  const challenges: MatchChallenge[] = [];

  const leftVision = current.relationship_vision ?? "";
  const rightVision = candidate.relationship_vision ?? "";
  if (leftVision && leftVision === rightVision) {
    easy.push(`You both want ${visionLabel(leftVision)}.`);
  }

  const leftOpenness = typeof current.emotional_openness === "number" ? current.emotional_openness : null;
  const rightOpenness = typeof candidate.emotional_openness === "number" ? candidate.emotional_openness : null;
  if (leftOpenness !== null && rightOpenness !== null && Math.abs(leftOpenness - rightOpenness) <= 1) {
    easy.push("Similar comfort with emotional vulnerability, so depth should feel natural.");
  }

  const leftConflict = typeof current.conflict_speed === "number" ? current.conflict_speed : null;
  const rightConflict = typeof candidate.conflict_speed === "number" ? candidate.conflict_speed : null;
  if (leftConflict !== null && rightConflict !== null && Math.abs(leftConflict - rightConflict) <= 1) {
    easy.push("You process conflict at a similar pace, which can make repair easier.");
  }
  if (leftConflict !== null && rightConflict !== null && Math.abs(leftConflict - rightConflict) >= 3) {
    const immediateFirst = leftConflict <= 2;
    challenges.push({
      issue: "Different conflict speeds",
      explanation: immediateFirst
        ? "You usually want to talk things through quickly while they may need space first."
        : "You often need space first while they may want to resolve things immediately.",
      script: immediateFirst
        ? "I process conflict by talking it through sooner. If you need space first, tell me and I'll respect it."
        : "I process conflict by stepping back first. It's not shutdown, I just need time before talking."
    });
  }

  const leftSupport = current.support_need ?? "";
  const rightSupport = candidate.support_need ?? "";
  const supportMismatch =
    (leftSupport === "validation" && rightSupport === "practical") ||
    (leftSupport === "practical" && rightSupport === "validation");
  if (supportMismatch) {
    const validationFirst = leftSupport === "validation";
    challenges.push({
      issue: "Different support styles",
      explanation: validationFirst
        ? "When stressed, you tend to need listening and validation while they may switch to solutions."
        : "When stressed, you tend to want practical solutions while they may need validation first.",
      script: validationFirst
        ? "Can you listen first for a few minutes before we move to solutions?"
        : "Do you want listening right now, or help solving this?"
    });
  }

  if (leftOpenness !== null && rightOpenness !== null && Math.abs(leftOpenness - rightOpenness) >= 3) {
    const depthFirst = leftOpenness <= 2;
    challenges.push({
      issue: "Different emotional depth needs",
      explanation: depthFirst
        ? "You likely want deeper emotional sharing than they naturally offer."
        : "You may be more private with emotions than they naturally prefer.",
      script: depthFirst
        ? "I feel connected through regular emotional check-ins. Can we make space for that?"
        : "I process a lot internally. If you need more sharing, tell me what helps you feel connected."
    });
  }

  const whatWillFeelEasy =
    easy.length > 0 ? easy.slice(0, 3) : ["Baseline compatibility looks solid enough to explore with intention."];

  return {
    matchName,
    score,
    whatWillFeelEasy,
    whatWillTakeWork: challenges.slice(0, 2)
  };
}
