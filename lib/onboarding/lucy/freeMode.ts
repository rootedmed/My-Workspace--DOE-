function parseBooleanEnv(raw: string | undefined): boolean | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return undefined;
}

export type LucyOnboardingEngine = "free_chat" | "legacy";

function parseEngineEnv(raw: string | undefined): LucyOnboardingEngine | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "free_chat" || normalized === "legacy") {
    return normalized;
  }
  return undefined;
}

export function resolveLucyOnboardingEngine(): LucyOnboardingEngine {
  const explicitEngine = parseEngineEnv(process.env.LUCY_ONBOARDING_ENGINE);
  if (explicitEngine) return explicitEngine;

  const forceLegacy = parseBooleanEnv(process.env.LUCY_FORCE_LEGACY_ONBOARDING);
  if (forceLegacy === true) return "legacy";

  const explicitFreeMode = parseBooleanEnv(process.env.LUCY_FREE_CONVO_ENABLED);
  if (explicitFreeMode !== undefined) {
    return explicitFreeMode ? "free_chat" : "legacy";
  }

  const devFlag = parseBooleanEnv(process.env.LUCY_FREE_CONVO_DEV_ENABLED);
  if (devFlag === true) return "free_chat";

  return "free_chat";
}

export function isLucyFreeConversationDevEnabled(): boolean {
  return resolveLucyOnboardingEngine() === "free_chat";
}
