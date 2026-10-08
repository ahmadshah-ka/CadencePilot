export const ACCOUNT_STATUSES = ["pending", "approved", "rejected", "suspended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const REVIEW_DECISIONS = ["approve", "reject", "suspend", "reinstate"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/**
 * Status an account moves to for a review decision, or null if the transition is not allowed.
 * Mirrors public.review_account_access in the database, which is the enforcing copy.
 */
export function nextAccountStatus(
  current: AccountStatus,
  decision: ReviewDecision,
): AccountStatus | null {
  switch (decision) {
    case "approve":
      return current === "pending" || current === "rejected" ? "approved" : null;
    case "reject":
      return current === "pending" ? "rejected" : null;
    case "suspend":
      return current === "approved" ? "suspended" : null;
    case "reinstate":
      return current === "suspended" ? "approved" : null;
  }
}

/** Decisions that remove access or refuse an applicant and therefore need explicit confirmation. */
export const DECISIONS_REQUIRING_CONFIRMATION: readonly ReviewDecision[] = ["reject", "suspend"];
