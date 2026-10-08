"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sanitizeNextPath } from "@/domain/access/safe-redirect";
import { getContainer } from "@/infrastructure/composition";
import { CALLBACK_PATH, NEXT_PATH_COOKIE, SIGN_IN_PATH } from "@/presentation/auth/page-guards";

const NEXT_PATH_COOKIE_MAX_AGE_SECONDS = 600;
const OAUTH_COOKIE_PATH = "/auth";

/** Starts Google sign-in (PKCE). Server action, so Next verifies the request origin. */
export async function signInWithGoogleAction(formData: FormData): Promise<void> {
  const container = getContainer();
  if (!container.config.ok) redirect(`${SIGN_IN_PATH}?error=unavailable`);
  const { app } = container.config.config;

  const nextPath = sanitizeNextPath(formData.get("next")?.toString());
  const jar = await cookies();
  jar.set(NEXT_PATH_COOKIE, nextPath, {
    httpOnly: true,
    sameSite: "lax",
    secure: app.env !== "development",
    path: OAUTH_COOKIE_PATH,
    maxAge: NEXT_PATH_COOKIE_MAX_AGE_SECONDS,
  });

  const providerUrl = await container.session
    .startGoogleSignIn(`${app.url}${CALLBACK_PATH}`)
    .catch((error: unknown) => {
      container.logger.error("could not start sign-in", { error });
      return null;
    });
  redirect(providerUrl ?? `${SIGN_IN_PATH}?error=unavailable`);
}

/** Ends the session and returns to the public home page. */
export async function signOutAction(): Promise<void> {
  await getContainer().session.signOut();
  // Drop cached private pages so nothing from the previous session can be shown after sign-out.
  revalidatePath("/", "layout");
  redirect("/");
}
