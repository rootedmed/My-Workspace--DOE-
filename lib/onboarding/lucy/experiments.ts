import crypto from "node:crypto";
import type { LucyExperimentVariant } from "@/lib/onboarding/lucy/types";

const LUCY_EXPERIMENT_SALT = "lucy-personality-overhaul-v1";
const DEFAULT_MODEL_VERSION_CONTROL = "rules-v1";
const DEFAULT_MODEL_VERSION_TREATMENT = "llm-first-v1";
const DEFAULT_PROMPT_VERSION_CONTROL = "structured-v1";
const DEFAULT_PROMPT_VERSION_TREATMENT = "conversational-v1";

export function assignLucyVariant(userId: string): LucyExperimentVariant {
  const digest = crypto.createHash("sha256").update(`${LUCY_EXPERIMENT_SALT}:${userId}`).digest();
  return (digest[0] ?? 0) % 2 === 0 ? "control_a" : "treatment_b";
}

export function normalizeLucyVariant(value: unknown, userId: string): LucyExperimentVariant {
  if (value === "control_a" || value === "treatment_b") {
    return value;
  }
  return assignLucyVariant(userId);
}

export function resolveLucyModelVersion(variant?: LucyExperimentVariant): string {
  const value = process.env.LUCY_MODEL_VERSION?.trim();
  if (value && value.length > 0) return value;
  return variant === "treatment_b" ? DEFAULT_MODEL_VERSION_TREATMENT : DEFAULT_MODEL_VERSION_CONTROL;
}

export function resolveLucyPromptVersion(variant?: LucyExperimentVariant): string {
  const value = process.env.LUCY_PROMPT_VERSION?.trim();
  if (value && value.length > 0) return value;
  return variant === "treatment_b" ? DEFAULT_PROMPT_VERSION_TREATMENT : DEFAULT_PROMPT_VERSION_CONTROL;
}
