import "server-only";
import { notFound, redirect } from "next/navigation";
import { resolvePrincipal } from "@/application/access/access-use-cases";
import { evaluateAccess, type Principal } from "@/domain/access/access-policy";
import { AppError } from "@/domain/errors/app-error";
import type { AppConfig } from "@/config/load-config";
import { getContainer } from "@/infrastructure/composition";

export const SIGN_IN_PATH = "/sign-in";
export const ACCOUNT_STATUS_PATH = "/account-status";
export const MFA_PATH = "/admin/mfa";
export const CALLBACK_PATH = "/auth/callback";
/** Short-lived cookie carrying the post-login path; keeps the OAuth redirect URL query-free. */
export const NEXT_PATH_COOKIE = "cp_next";

/** Validated configuration, or a safe error page if the deployment is misconfigured. */
export function getAppConfig(): AppConfig {
  const { config } = getContainer();
  if (!config.ok) {
    throw new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
  }
  return config.config;
}

/** The current principal resolved from fresh database state, or null when signed out. */
export async function getPrincipal(): Promise<Principal | null> {
  const container = getContainer();
  return resolvePrincipal({
    identity: container.identity,
    access: container.access,
    logger: container.logger,
  });
}

function signInUrl(nextPath: string): string {
  return `${SIGN_IN_PATH}?next=${encodeURIComponent(nextPath)}`;
}

/**
 * Page-level gate for approved accounts. Signed-out users go to sign-in (keeping the intended
 * path); pending, rejected and suspended users go to the status page and never load product data.
 */
export async function requireApprovedPage(nextPath: string): Promise<Principal> {
  const principal = await getPrincipal();
  const decision = evaluateAccess(principal, { kind: "approved" });
  if (!decision.allowed) {
    if (decision.reason === "unauthenticated") redirect(signInUrl(nextPath));
    redirect(ACCOUNT_STATUS_PATH);
  }
  return principal as Principal;
}

/**
 * Page-level gate for the owner area. Non-owners get a 404 so the area's existence is not
 * revealed. Owners without a second factor are sent to MFA setup unless `allowWithoutMfa`.
 */
export async function requireOwnerPage(
  nextPath: string,
  options: { allowWithoutMfa?: boolean } = {},
): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) redirect(signInUrl(nextPath));
  const base = evaluateAccess(principal, { kind: "owner", mfaRequired: false });
  if (!base.allowed) {
    if (base.reason === "not_owner") notFound();
    redirect(ACCOUNT_STATUS_PATH);
  }
  const mfaRequired = getAppConfig().ownerMfaRequired && !options.allowWithoutMfa;
  if (mfaRequired && !principal.mfaVerified) redirect(MFA_PATH);
  return principal;
}
