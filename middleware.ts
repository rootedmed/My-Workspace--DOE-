import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { logStructured } from "@/lib/observability/logger";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/config";

export async function middleware(request: NextRequest) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  let response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  const supabase = createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value }));
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
        }
        response = NextResponse.next({
          request: {
            headers: requestHeaders
          }
        });
        for (const cookie of cookiesToSet) {
          response.cookies.set(cookie.name, cookie.value, cookie.options as CookieOptions);
        }
      }
    }
  });

  await supabase.auth.getUser();

  response.headers.set("x-request-id", requestId);

  logStructured("info", "api_request", {
    request_id: requestId,
    method: request.method,
    route: request.nextUrl.pathname
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
