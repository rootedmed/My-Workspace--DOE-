type EnvLike = Record<string, string | undefined>;

export type UiRouteKey =
  | "public_auth"
  | "home_me"
  | "onboarding_results"
  | "discover"
  | "matches"
  | "guest_snapshot";

export type UiFlags = {
  redesignEnabled: boolean;
  publicAuthEnabled: boolean;
  homeMeEnabled: boolean;
  onboardingResultsEnabled: boolean;
  discoverEnabled: boolean;
  matchesEnabled: boolean;
  guestSnapshotEnabled: boolean;
  uxTelemetryEnabled: boolean;
};

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value !== "string") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

export function getUiFlags(env: EnvLike = process.env): UiFlags {
  const redesignEnabled = parseBoolean(
    env.NEXT_PUBLIC_UI_REDESIGN_ENABLED ?? env.UI_REDESIGN_ENABLED,
    true
  );

  const publicAuthEnabled =
    redesignEnabled && parseBoolean(env.NEXT_PUBLIC_UI_FLAG_PUBLIC_AUTH, true);
  const homeMeEnabled =
    redesignEnabled && parseBoolean(env.NEXT_PUBLIC_UI_FLAG_HOME_ME, true);
  const onboardingResultsEnabled =
    redesignEnabled && parseBoolean(env.NEXT_PUBLIC_UI_FLAG_ONBOARDING_RESULTS, true);
  const discoverEnabled =
    redesignEnabled && parseBoolean(env.NEXT_PUBLIC_UI_FLAG_DISCOVER, true);
  const matchesEnabled =
    redesignEnabled && parseBoolean(env.NEXT_PUBLIC_UI_FLAG_MATCHES, true);
  const guestSnapshotEnabled =
    redesignEnabled && parseBoolean(env.NEXT_PUBLIC_UI_FLAG_GUEST_SNAPSHOT, true);

  const uxTelemetryEnabled = parseBoolean(
    env.NEXT_PUBLIC_UX_TELEMETRY_ENABLED ?? env.UX_TELEMETRY_ENABLED,
    true
  );

  return {
    redesignEnabled,
    publicAuthEnabled,
    homeMeEnabled,
    onboardingResultsEnabled,
    discoverEnabled,
    matchesEnabled,
    guestSnapshotEnabled,
    uxTelemetryEnabled
  };
}

export function isUiRouteEnabled(route: UiRouteKey, env: EnvLike = process.env): boolean {
  const flags = getUiFlags(env);

  switch (route) {
    case "public_auth":
      return flags.publicAuthEnabled;
    case "home_me":
      return flags.homeMeEnabled;
    case "onboarding_results":
      return flags.onboardingResultsEnabled;
    case "discover":
      return flags.discoverEnabled;
    case "matches":
      return flags.matchesEnabled;
    case "guest_snapshot":
      return flags.guestSnapshotEnabled;
    default:
      return true;
  }
}

export function isUxTelemetryEnabled(env: EnvLike = process.env): boolean {
  return getUiFlags(env).uxTelemetryEnabled;
}
