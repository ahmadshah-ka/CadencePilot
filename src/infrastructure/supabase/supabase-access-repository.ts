import type {
  AccessRepository,
  AccountPage,
  AccountRecord,
  ListAccountsQuery,
  ReviewInput,
  ReviewResult,
} from "@/application/ports/access-repository";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/domain/access/account-status";
import { AppError } from "@/domain/errors/app-error";
import { createServiceClient, createUserClient, type SupabaseSettings } from "./clients";
import { mapDatabaseError } from "./db-errors";

const ACCOUNT_COLUMNS = "user_id,email,display_name,status,revision,created_at,reviewed_at";
const UNAVAILABLE = () =>
  new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
const CURSOR_PATTERN = /^[0-9TZ:.+-]+\|[0-9a-f-]{36}$/i;

interface AccountRow {
  user_id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  revision: number;
  created_at: string;
  reviewed_at: string | null;
}

function toRecord(row: AccountRow): AccountRecord {
  if (!(ACCOUNT_STATUSES as readonly string[]).includes(row.status)) throw UNAVAILABLE();
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    status: row.status as AccountStatus,
    revision: row.revision,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at,
  };
}

export function createSupabaseAccessRepository(settings: SupabaseSettings): AccessRepository {
  return {
    async getAccount(userId) {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase
        .from("account_access")
        .select(ACCOUNT_COLUMNS)
        .eq("user_id", userId)
        .maybeSingle<AccountRow>();
      if (error) throw UNAVAILABLE();
      return data ? toRecord(data) : null;
    },

    async isOwner(userId) {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", userId)
        .eq("role", "owner")
        .maybeSingle();
      if (error) throw UNAVAILABLE();
      return data !== null;
    },

    async ensureAccount(userId) {
      const { error } = await createServiceClient(settings).rpc("ensure_account_access", {
        p_user: userId,
      });
      if (error) throw UNAVAILABLE();
    },

    async listAccounts(query: ListAccountsQuery): Promise<AccountPage> {
      const supabase = await createUserClient(settings);
      let request = supabase
        .from("account_access")
        .select(ACCOUNT_COLUMNS)
        .order("created_at", { ascending: true })
        .order("user_id", { ascending: true })
        .limit(query.limit + 1);
      if (query.status) request = request.eq("status", query.status);
      if (query.cursor) {
        if (!CURSOR_PATTERN.test(query.cursor)) {
          throw new AppError("INVALID_REQUEST", "The cursor is not valid.");
        }
        const [createdAt, userId] = query.cursor.split("|") as [string, string];
        request = request.or(
          `created_at.gt."${createdAt}",and(created_at.eq."${createdAt}",user_id.gt.${userId})`,
        );
      }
      const { data, error } = await request.returns<AccountRow[]>();
      if (error) throw UNAVAILABLE();
      const rows = data ?? [];
      const page = rows.slice(0, query.limit).map(toRecord);
      const last = page[page.length - 1];
      const hasMore = rows.length > query.limit;
      return {
        items: page,
        nextCursor: hasMore && last ? `${last.createdAt}|${last.userId}` : null,
      };
    },

    async review(input: ReviewInput): Promise<ReviewResult> {
      const { data, error } = await createServiceClient(settings).rpc("review_account_access", {
        p_actor: input.actorId,
        p_target: input.targetId,
        p_decision: input.decision,
        p_expected_revision: input.expectedRevision,
        p_note: input.note,
      });
      if (error) throw mapDatabaseError(error);
      const row = (data as Array<{ status: string; revision: number }> | null)?.[0];
      if (!row || !(ACCOUNT_STATUSES as readonly string[]).includes(row.status))
        throw UNAVAILABLE();
      return { status: row.status as AccountStatus, revision: row.revision };
    },
  };
}
