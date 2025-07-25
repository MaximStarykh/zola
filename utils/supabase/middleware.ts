import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function updateSession(request: NextRequest) {
  if (!isSupabaseEnabled) {
    return NextResponse.next({ request });
  }

  // This response object is passed through the middleware chain and is used to
  // set cookies for the user's session.
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options) {
          // If the cookie is set, update the request and response.
          request.cookies.set({ name, value, ...options });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options) {
          // If the cookie is removed, update the request and response.
          request.cookies.set({ name, value: "", ...options });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // This will refresh the user's session if it has expired.
  // It's important to await this call to ensure the session is updated before
  // continuing.
  await supabase.auth.getUser();

  return response;
}
