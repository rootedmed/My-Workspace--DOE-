function parseBooleanEnv(raw: string | undefined): boolean | undefined {
  if (typeof raw !== "string") return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return undefined;
}

export function isLucyFreeConversationDevEnabled(): boolean {
  const forceLegacy = parseBooleanEnv(process.env.LUCY_FORCE_LEGACY_ONBOARDING);
  if (forceLegacy === true) return false;

  const explicitFreeMode = parseBooleanEnv(process.env.LUCY_FREE_CONVO_ENABLED);
  if (explicitFreeMode !== undefined) return explicitFreeMode;

  const devFlag = parseBooleanEnv(process.env.LUCY_FREE_CONVO_DEV_ENABLED);
  if (devFlag === true) return true;

  return process.env.NODE_ENV === "production";
}
