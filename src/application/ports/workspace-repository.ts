import type { WorkspaceMembership } from "@/domain/access/access-policy";

export interface WorkspaceRecord {
  id: string;
  name: string;
  createdAt: string;
}

export type JsonObject = Record<string, unknown>;

export interface BrandRecord {
  id: string;
  workspaceId: string;
  name: string;
  profile: JsonObject;
  targets: JsonObject;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BrandPage {
  items: BrandRecord[];
  nextCursor: string | null;
}

export interface BrandPatch {
  name?: string;
  profile?: JsonObject;
  targets?: JsonObject;
  /** true archives, false restores. Brands are never deleted. */
  archived?: boolean;
}

/**
 * Workspace and brand persistence. Every method runs as the signed-in user so row-level security
 * applies; every brand method also filters by workspaceId explicitly (defense in depth).
 */
export interface WorkspaceRepository {
  /** The caller's active membership of that workspace, or null (including when revoked). */
  getMembership(userId: string, workspaceId: string): Promise<WorkspaceMembership | null>;
  /** The caller's own workspace, or null if none exists yet. */
  findOwnWorkspace(): Promise<WorkspaceRecord | null>;
  /**
   * Idempotently creates the caller's workspace and owner membership in one transaction.
   * @returns The workspace id (existing or new).
   * @throws AppError FORBIDDEN (not approved) or INVALID_REQUEST (bad name).
   */
  createInitialWorkspace(name: string): Promise<string>;
  getWorkspace(workspaceId: string): Promise<WorkspaceRecord | null>;
  listBrands(
    workspaceId: string,
    query: { includeArchived: boolean; cursor: string | null; limit: number },
  ): Promise<BrandPage>;
  getBrand(workspaceId: string, brandId: string): Promise<BrandRecord | null>;
  countActiveBrands(workspaceId: string): Promise<number>;
  createBrand(
    workspaceId: string,
    input: { name: string; profile: JsonObject; targets: JsonObject },
  ): Promise<BrandRecord>;
  /**
   * Conditional update.
   * @throws AppError NOT_FOUND (no such brand in this workspace) or CONFLICT (stale revision or
   *   duplicate active name).
   */
  updateBrand(
    workspaceId: string,
    brandId: string,
    expectedRevision: number,
    patch: BrandPatch,
  ): Promise<BrandRecord>;
}
