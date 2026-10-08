import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { completeSignIn } from "@/application/access/sign-in-use-cases";
import { DEFAULT_REDIRECT_PATH, sanitizeNextPath } from "@/domain/access/safe-redirect";
import { getContainer } from "@/infrastructure/composition";
import { NEXT_PATH_COOKIE, SIGN_IN_PATH } from "@/presentation/auth/page-guards";

export const dynamic = "force-dynamic";

/**
 * Access policy: public (this is where the session is created). The PKCE code is single-use and
 * bound to the verifier cookie set when sign-in started; anything invalid is rejected generically.
 * Redirects are built from the configured APP_URL, never from request headers.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const container = getContainer();
  const base = container.config.ok ? container.config.config.app.url : new URL(request.url).origin;
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, base), 303);
  if (!container.config.ok) return redirectTo(`${SIGN_IN_PATH}?error=unavailable`);

  const jar = await cookies();
  const nextPath = sanitizeNextPath(jar.get(NEXT_PATH_COOKIE)?.value ?? DEFAULT_REDIRECT_PATH);
  jar.delete({ name: NEXT_PATH_COOKIE, path: "/auth" });

  const params = new URL(request.url).searchParams;
  const outcome = await completeSignIn(
    { session: container.session, access: container.access, logger: container.logger },
    { code: params.get("code"), providerError: params.get("error") },
  );
  if (outcome === "ok") return redirectTo(nextPath);
  return redirectTo(`${SIGN_IN_PATH}?error=${outcome}`);
}
