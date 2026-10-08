import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session cookies on page navigations and sends signed-out visitors of
 * private areas to sign-in. This is a convenience only: every page, action and API re-checks
 * authorization on the server (see presentation/auth/page-guards.ts), so skipping this proxy
 * never grants access.
 */
const PRIVATE_PREFIXES = ["/app", "/admin"];

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let response = NextResponse.next({ request });
  if (!url || !key) return response;

  const secure = process.env.APP_ENV !== "development";
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) {
          response.cookies.set(name, value, { ...options, httpOnly: true, secure });
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPrivate = PRIVATE_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
  if (isPrivate) {
    if (!data.user) {
      const target = new URL("/sign-in", request.url);
      target.searchParams.set("next", `${path}${request.nextUrl.search}`);
      return NextResponse.redirect(target);
    }
    response.headers.set("cache-control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: ["/app/:path*", "/admin/:path*", "/account-status", "/sign-in"],
};
