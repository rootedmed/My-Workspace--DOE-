import { createServerSupabaseClient } from "@/lib/supabase/server";

type SupabaseAuthUser = {
  id: string;
  email: string;
  user_metadata?: {
    firstName?: string;
    first_name?: string;
  };
};

export type SupabaseAuthLookupResult = {
  user: SupabaseAuthUser | null;
  errorCode: string | null;
  errorMessage: string | null;
};

type SignInResponse = {
  user: SupabaseAuthUser;
  access_token: string;
  expires_in: number;
};

type SignUpResponse = {
  user: SupabaseAuthUser | null;
  sessionActive: boolean;
};

export async function signInWithPassword(email: string, password: string): Promise<SignInResponse> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user || !data.session) {
    throw new Error("Auth request failed");
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? email,
      user_metadata: {
        firstName: data.user.user_metadata?.firstName,
        first_name: data.user.user_metadata?.first_name
      }
    },
    access_token: data.session.access_token,
    expires_in: data.session.expires_in ?? 3600
  };
}

export async function signUpWithPassword(
  email: string,
  password: string,
  firstName: string
): Promise<SignUpResponse> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { firstName }
    }
  });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("already")) {
      throw new Error("Email already exists");
    }
    throw new Error("Auth request failed");
  }

  return {
    sessionActive: Boolean(data.session?.access_token),
    user: data.user
      ? {
          id: data.user.id,
          email: data.user.email ?? email,
          user_metadata: {
            firstName: data.user.user_metadata?.firstName,
            first_name: data.user.user_metadata?.first_name
          }
        }
      : null
  };
}

export async function getUserFromAccessToken(): Promise<SupabaseAuthLookupResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    return {
      user: null,
      errorCode: typeof error.code === "string" ? error.code : null,
      errorMessage: error.message ?? null
    };
  }
  if (!data.user?.email) {
    return {
      user: null,
      errorCode: null,
      errorMessage: null
    };
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email,
      user_metadata: {
        firstName: data.user.user_metadata?.firstName,
        first_name: data.user.user_metadata?.first_name
      }
    },
    errorCode: null,
    errorMessage: null
  };
}

export async function signOutAccessToken(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
}
