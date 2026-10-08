import { AppError } from "@/domain/errors/app-error";
import {
  evaluateAccess,
  type AccessRequirement,
  type Principal,
} from "@/domain/access/access-policy";
import type { ReviewDecision } from "@/domain/access/account-status";
import type {
  AccessRepository,
  AccountPage,
  ReviewResult,
} from "@/application/ports/access-repository";
import type { Identity, IdentityProvider } from "@/application/ports/identity";
import type { Logger } from "@/application/ports/logger";

export interface AccessDeps {
  identity: IdentityProvider;
  access: AccessRepository;
  logger: Logger;
  ownerMfaRequired: boolean;
}

/**
 * Builds the principal for the current request from fresh database state (never cached), so
 * suspension and rejection take effect on the next request.
 *
 * @returns null when not signed in.
 */
export async function resolvePrincipal(
  deps: Pick<AccessDeps, "identity" | "access" | "logger">,
): Promise<Principal | null> {
  const identity: Identity | null = await deps.identity.getIdentity();
  if (!identity) return null;

  let account = await deps.access.getAccount(identity.userId);
  if (!account) {
    // Repairs users created before the database trigger existed. Idempotent and status-neutral.
    await deps.access.ensureAccount(identity.userId);
    account = await deps.access.getAccount(identity.userId);
  }
  const isOwner =
    account?.status === "approved" ? await deps.access.isOwner(identity.userId) : false;

  return {
    userId: identity.userId,
    accountStatus: account?.status ?? null,
    isOwner,
    mfaVerified: identity.aal === "aal2",
  };
}

/**
 * Throws if the principal does not satisfy the requirement.
 *
 * @throws AppError UNAUTHENTICATED or FORBIDDEN with a coarse, safe reason.
 */
export function assertAccess(
  principal: Principal | null,
  requirement: AccessRequirement,
): Principal {
  const decision = evaluateAccess(principal, requirement);
  if (!decision.allowed) {
    throw new AppError(
      decision.code,
      decision.code === "UNAUTHENTICATED" ? "Sign in required." : "You do not have access.",
      { reason: decision.reason },
    );
  }
  return principal as Principal;
}

export interface ReviewCommand {
  targetUserId: string;
  decision: ReviewDecision;
  expectedRevision: number;
  note: string | null;
}

/**
 * Owner approves, rejects, suspends or reinstates an account. Rechecks owner + MFA, then applies
 * the change transactionally; the database emits the audit record and notification intent.
 */
export async function reviewAccount(
  deps: Pick<AccessDeps, "access" | "logger" | "ownerMfaRequired">,
  principal: Principal | null,
  command: ReviewCommand,
): Promise<ReviewResult> {
  const actor = assertAccess(principal, { kind: "owner", mfaRequired: deps.ownerMfaRequired });
  const result = await deps.access.review({
    actorId: actor.userId,
    targetId: command.targetUserId,
    decision: command.decision,
    expectedRevision: command.expectedRevision,
    note: command.note,
  });
  deps.logger.info("account reviewed", {
    actorId: actor.userId,
    targetId: command.targetUserId,
    decision: command.decision,
    status: result.status,
  });
  return result;
}

/** Owner-only paginated applicant listing. */
export async function listAccounts(
  deps: Pick<AccessDeps, "access" | "ownerMfaRequired">,
  principal: Principal | null,
  query: { status: AccountPageQueryStatus; cursor: string | null; limit: number },
): Promise<AccountPage> {
  assertAccess(principal, { kind: "owner", mfaRequired: deps.ownerMfaRequired });
  return deps.access.listAccounts(query);
}

type AccountPageQueryStatus = Parameters<AccessRepository["listAccounts"]>[0]["status"];
