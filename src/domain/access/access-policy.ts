import type { AccountStatus } from "./account-status";

/** The authenticated caller as resolved fresh from the database on every request. */
export interface Principal {
  userId: string;
  /** Null when the account has no access record yet. */
  accountStatus: AccountStatus | null;
  isOwner: boolean;
  /** True when the session was elevated with a second factor (aal2). */
  mfaVerified: boolean;
}

export type AccessRequirement =
  { kind: "authenticated" } | { kind: "approved" } | { kind: "owner"; mfaRequired: boolean };

export type DenialReason =
  | "unauthenticated"
  | "account_pending"
  | "account_rejected"
  | "account_suspended"
  | "account_unknown"
  | "not_owner"
  | "mfa_required";

export type AccessDecision =
  | { allowed: true }
  | { allowed: false; code: "UNAUTHENTICATED" | "FORBIDDEN"; reason: DenialReason };

const deny = (code: "UNAUTHENTICATED" | "FORBIDDEN", reason: DenialReason): AccessDecision => ({
  allowed: false,
  code,
  reason,
});

function statusDenial(status: AccountStatus | null): DenialReason | null {
  switch (status) {
    case "approved":
      return null;
    case "pending":
      return "account_pending";
    case "rejected":
      return "account_rejected";
    case "suspended":
      return "account_suspended";
    case null:
      return "account_unknown";
  }
}

/**
 * Central access decision. Authentication is not approval: only approved accounts pass
 * "approved", and owners must also be approved (a suspended owner loses owner rights).
 *
 * @param principal The caller, or null when not signed in.
 * @param requirement What the route or use case needs.
 */
export function evaluateAccess(
  principal: Principal | null,
  requirement: AccessRequirement,
): AccessDecision {
  if (!principal) return deny("UNAUTHENTICATED", "unauthenticated");
  if (requirement.kind === "authenticated") return { allowed: true };

  const denial = statusDenial(principal.accountStatus);
  if (denial) return deny("FORBIDDEN", denial);
  if (requirement.kind === "approved") return { allowed: true };

  if (!principal.isOwner) return deny("FORBIDDEN", "not_owner");
  if (requirement.mfaRequired && !principal.mfaVerified) return deny("FORBIDDEN", "mfa_required");
  return { allowed: true };
}

export interface WorkspaceMembership {
  workspaceId: string;
  role: "owner" | "member";
  revoked: boolean;
}

/**
 * Whether the principal may act inside a workspace. Owner (platform) rights never imply workspace
 * access: only an unrevoked membership of that exact workspace counts.
 */
export function canAccessWorkspace(
  principal: Principal,
  membership: WorkspaceMembership | null,
  workspaceId: string,
): boolean {
  if (principal.accountStatus !== "approved") return false;
  return membership !== null && !membership.revoked && membership.workspaceId === workspaceId;
}
