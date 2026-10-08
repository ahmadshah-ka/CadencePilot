import type {
  BrandPatch,
  BrandRecord,
  JsonObject,
  WorkspaceRecord,
  WorkspaceRepository,
} from "@/application/ports/workspace-repository";
import { AppError } from "@/domain/errors/app-error";
import { createUserClient, type SupabaseSettings } from "./clients";
import { mapDatabaseError } from "./db-errors";

const UNAVAILABLE = () =>
  new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
const BRAND_COLUMNS =
  "id,workspace_id,name,profile,targets,revision,archived_at,created_at,updated_at";
const CURSOR_PATTERN = /^[0-9TZ:.+-]+\|[0-9a-f-]{36}$/i;

interface BrandRow {
  id: string;
  workspace_id: string;
  name: string;
  profile: JsonObject;
  targets: JsonObject;
  revision: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

const toBrand = (row: BrandRow): BrandRecord => ({
  id: row.id,
  workspaceId: row.workspace_id,
  name: row.name,
  profile: row.profile,
  targets: row.targets,
  revision: row.revision,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

interface WorkspaceRow {
  id: string;
  name: string;
  created_at: string;
}
const toWorkspace = (row: WorkspaceRow): WorkspaceRecord => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
});

/** Runs as the signed-in user: row-level security is the second line of defence. */
export function createSupabaseWorkspaceRepository(settings: SupabaseSettings): WorkspaceRepository {
  return {
    async getMembership(userId, workspaceId) {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase
        .from("workspace_members")
        .select("workspace_id,role,revoked_at")
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId)
        .maybeSingle<{
          workspace_id: string;
          role: "owner" | "member";
          revoked_at: string | null;
        }>();
      if (error) throw UNAVAILABLE();
      if (!data) return null;
      return { workspaceId: data.workspace_id, role: data.role, revoked: data.revoked_at !== null };
    },

    async findOwnWorkspace() {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase
        .from("workspaces")
        .select("id,name,created_at")
        .order("created_at", { ascending: true })
        .limit(1)
        .returns<WorkspaceRow[]>();
      if (error) throw UNAVAILABLE();
      const row = data?.[0];
      return row ? toWorkspace(row) : null;
    },

    async createInitialWorkspace(name) {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase.rpc("create_initial_workspace", { p_name: name });
      if (error) throw mapDatabaseError(error);
      if (typeof data !== "string") throw UNAVAILABLE();
      return data;
    },

    async getWorkspace(workspaceId) {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase
        .from("workspaces")
        .select("id,name,created_at")
        .eq("id", workspaceId)
        .maybeSingle<WorkspaceRow>();
      if (error) throw UNAVAILABLE();
      return data ? toWorkspace(data) : null;
    },

    async listBrands(workspaceId, query) {
      const supabase = await createUserClient(settings);
      let request = supabase
        .from("brands")
        .select(BRAND_COLUMNS)
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(query.limit + 1);
      if (!query.includeArchived) request = request.is("archived_at", null);
      if (query.cursor) {
        if (!CURSOR_PATTERN.test(query.cursor)) {
          throw new AppError("INVALID_REQUEST", "The cursor is not valid.");
        }
        const [createdAt, id] = query.cursor.split("|") as [string, string];
        request = request.or(
          `created_at.gt."${createdAt}",and(created_at.eq."${createdAt}",id.gt.${id})`,
        );
      }
      const { data, error } = await request.returns<BrandRow[]>();
      if (error) throw UNAVAILABLE();
      const rows = data ?? [];
      const items = rows.slice(0, query.limit).map(toBrand);
      const last = items[items.length - 1];
      return {
        items,
        nextCursor: rows.length > query.limit && last ? `${last.createdAt}|${last.id}` : null,
      };
    },

    async getBrand(workspaceId, brandId) {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase
        .from("brands")
        .select(BRAND_COLUMNS)
        .eq("workspace_id", workspaceId)
        .eq("id", brandId)
        .maybeSingle<BrandRow>();
      if (error) throw UNAVAILABLE();
      return data ? toBrand(data) : null;
    },

    async countActiveBrands(workspaceId) {
      const supabase = await createUserClient(settings);
      const { count, error } = await supabase
        .from("brands")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .is("archived_at", null);
      if (error || count === null) throw UNAVAILABLE();
      return count;
    },

    async createBrand(workspaceId, input) {
      const supabase = await createUserClient(settings);
      const { data, error } = await supabase
        .from("brands")
        .insert({
          workspace_id: workspaceId,
          name: input.name,
          profile: input.profile,
          targets: input.targets,
        })
        .select(BRAND_COLUMNS)
        .single<BrandRow>();
      if (error) throw mapDatabaseError(error);
      return toBrand(data);
    },

    async updateBrand(workspaceId, brandId, expectedRevision, patch: BrandPatch) {
      const supabase = await createUserClient(settings);
      const columns: Record<string, unknown> = {};
      if (patch.name !== undefined) columns.name = patch.name;
      if (patch.profile !== undefined) columns.profile = patch.profile;
      if (patch.targets !== undefined) columns.targets = patch.targets;
      if (patch.archived !== undefined) {
        columns.archived_at = patch.archived ? new Date().toISOString() : null;
      }
      const { data, error } = await supabase
        .from("brands")
        .update(columns)
        .eq("workspace_id", workspaceId)
        .eq("id", brandId)
        .eq("revision", expectedRevision)
        .select(BRAND_COLUMNS)
        .maybeSingle<BrandRow>();
      if (error) throw mapDatabaseError(error);
      if (data) return toBrand(data);

      // No row changed: either the brand is not in this workspace, or the revision was stale.
      const existing = await this.getBrand(workspaceId, brandId);
      if (!existing) throw new AppError("NOT_FOUND", "Not found.");
      throw new AppError("CONFLICT", "The record changed. Reload and try again.", {
        reason: "stale_revision",
      });
    },
  };
}
