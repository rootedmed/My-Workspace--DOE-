import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logStructured } from "@/lib/observability/logger";
import { formatSupabaseError, pickSupabaseError } from "@/lib/observability/supabase";

type AuthContextUser = {
  id: string;
  email: string;
  firstName: string;
};

export async function ensureAppUser(user: AuthContextUser): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("app_users").upsert(
    {
      id: user.id,
      email: user.email,
      first_name: user.firstName,
      password_hash: "external_auth",
      salt: "external_auth"
    },
    { onConflict: "id" }
  );

  if (error) {
    const err = pickSupabaseError(error);
    logStructured("error", "supabase_write", {
      operation: "upsert",
      table: "app_users",
      user_id: user.id,
      status: "error",
      error_code: err?.code ?? null,
      error_message: err?.message ?? null,
      error_details: err?.details ?? null
    });
    throw new Error(`Could not sync app user profile: ${formatSupabaseError(error)}`);
  }

  logStructured("info", "supabase_write", {
    operation: "upsert",
    table: "app_users",
    user_id: user.id,
    status: "ok"
  });
}
