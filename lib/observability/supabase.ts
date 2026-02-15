export type SupabaseErrorLike = {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
};

export function pickSupabaseError(error: unknown): SupabaseErrorLike | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const maybe = error as SupabaseErrorLike;
  if (!maybe.message && !maybe.code) {
    return null;
  }

  return {
    code: maybe.code ?? null,
    message: maybe.message ?? null,
    details: maybe.details ?? null,
    hint: maybe.hint ?? null
  };
}

export function formatSupabaseError(error: unknown): string {
  const picked = pickSupabaseError(error);
  if (picked) {
    return [picked.code, picked.message, picked.details, picked.hint].filter(Boolean).join(" | ");
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown error";
}
