import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value }));
      },
      setAll(cookiesToSet) {
        try {
          for (const cookie of cookiesToSet) {
            cookieStore.set(cookie.name, cookie.value, cookie.options as CookieOptions);
          }
        } catch {
          // Server Components may read cookies but cannot mutate them.
          // Route handlers and server actions can still persist auth cookies.
        }
      }
    }
  });
}
