import type { AccountStatus, ReviewDecision } from "@/domain/access/account-status";

export interface AccountRecord {
  userId: string;
  email: string | null;
  displayName: string | null;
  status: AccountStatus;
  revision: number;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AccountPage {
  items: AccountRecord[];
  /** Opaque cursor for the next page, or null when exhausted. */
  nextCursor: string | null;
}

export interface ListAccountsQuery {
  status: AccountStatus | null;
  cursor: string | null;
  limit: number;
}

export interface ReviewInput {
  actorId: string;
  targetId: string;
  decision: ReviewDecision;
  expectedRevision: number;
  note: string | null;
}

export interface ReviewResult {
  status: AccountStatus;
  revision: number;
}

export interface AccessRepository {
  /** The caller's own access record (row-level security applies), or null if none exists. */
  getAccount(userId: string): Promise<AccountRecord | null>;
  /** Whether the caller has a platform owner row (their own row only). */
  isOwner(userId: string): Promise<boolean>;
  /** Creates a pending record from the auth user if missing. Privileged, idempotent. */
  ensureAccount(userId: string): Promise<void>;
  /** Owner-only listing, ordered oldest first with a stable (created_at, user_id) cursor. */
  listAccounts(query: ListAccountsQuery): Promise<AccountPage>;
  /**
   * Applies a review in one database transaction with an expected-revision check.
   * @throws AppError FORBIDDEN, NOT_FOUND or CONFLICT (stale revision or invalid transition).
   */
  review(input: ReviewInput): Promise<ReviewResult>;
}
