import { createServerSupabaseClient } from "@/lib/supabase/server";

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
    throw new Error("Could not sync app user profile");
  }
}
