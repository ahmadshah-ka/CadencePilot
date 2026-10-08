import type { AccessRepository } from "@/application/ports/access-repository";
import type { AuthSessionService } from "@/application/ports/auth-session";
import type { Logger } from "@/application/ports/logger";

export type SignInOutcome = "ok" | "cancelled" | "failed";

/**
 * Completes the Google OAuth (PKCE) callback. A missing code or provider error is a cancellation;
 * an invalid/expired code or unverified email is a failure and leaves no session behind.
 * Newly authenticated users get a pending access record; this never grants approval.
 */
export async function completeSignIn(
  deps: { session: AuthSessionService; access: AccessRepository; logger: Logger },
  input: { code: string | null; providerError: string | null },
): Promise<SignInOutcome> {
  if (input.providerError || !input.code) return "cancelled";
  try {
    const user = await deps.session.completeSignIn(input.code);
    if (!user) return "failed";
    if (!user.emailVerified) {
      await deps.session.signOut();
      deps.logger.warn("sign-in rejected: email not verified", { userId: user.userId });
      return "failed";
    }
    await deps.access.ensureAccount(user.userId);
    return "ok";
  } catch (error) {
    deps.logger.error("sign-in failed", { error });
    return "failed";
  }
}
