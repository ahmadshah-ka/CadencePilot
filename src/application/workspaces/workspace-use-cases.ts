import type { Logger } from "@/application/ports/logger";
import type {
  BrandPage,
  BrandPatch,
  BrandRecord,
  JsonObject,
  WorkspaceRecord,
  WorkspaceRepository,
} from "@/application/ports/workspace-repository";
import { assertAccess } from "@/application/access/access-use-cases";
import { canAccessWorkspace, type Principal } from "@/domain/access/access-policy";
import { isPlainObject, jsonByteSize, normalizeDisplayName } from "@/domain/brands/brand-rules";
import { AppError } from "@/domain/errors/app-error";

export interface WorkspaceLimits {
  workspaceNameMaxLength: number;
  brandNameMaxLength: number;
  brandSettingsMaxBytes: number;
  maxBrandsPerWorkspace: number;
}

export interface WorkspaceDeps {
  workspaces: WorkspaceRepository;
  logger: Logger;
  limits: WorkspaceLimits;
}

const notFound = () => new AppError("NOT_FOUND", "Not found.");
const invalid = (message: string) => new AppError("INVALID_REQUEST", message);

function parseName(raw: string, maxLength: number, label: string): string {
  const name = normalizeDisplayName(raw, maxLength);
  if (!name) throw invalid(`${label} must be 1 to ${maxLength} characters.`);
  return name;
}

function parseSettings(value: unknown, maxBytes: number, label: string): JsonObject {
  if (!isPlainObject(value)) throw invalid(`${label} must be an object.`);
  if (jsonByteSize(value) > maxBytes) throw invalid(`${label} is too large.`);
  return value;
}

/**
 * Resolves and authorizes a workspace scope. The workspace id from the client is never trusted:
 * it must match an unrevoked membership of this principal, otherwise the result is NOT_FOUND
 * (indistinguishable from a workspace that does not exist). Platform owner rights do not count.
 */
export async function authorizeWorkspace(
  deps: Pick<WorkspaceDeps, "workspaces">,
  principal: Principal | null,
  workspaceId: string,
): Promise<Principal> {
  const approved = assertAccess(principal, { kind: "approved" });
  const membership = await deps.workspaces.getMembership(approved.userId, workspaceId);
  if (!canAccessWorkspace(approved, membership, workspaceId)) throw notFound();
  return approved;
}

/** The caller's own workspace, or null before onboarding creates one. */
export async function getCurrentWorkspace(
  deps: Pick<WorkspaceDeps, "workspaces">,
  principal: Principal | null,
): Promise<WorkspaceRecord | null> {
  assertAccess(principal, { kind: "approved" });
  return deps.workspaces.findOwnWorkspace();
}

/** Idempotent: repeating the request returns the same workspace and never creates a second. */
export async function ensureWorkspace(
  deps: WorkspaceDeps,
  principal: Principal | null,
  rawName: string,
): Promise<WorkspaceRecord> {
  const approved = assertAccess(principal, { kind: "approved" });
  const name = parseName(rawName, deps.limits.workspaceNameMaxLength, "Workspace name");
  const id = await deps.workspaces.createInitialWorkspace(name);
  const workspace = await deps.workspaces.getWorkspace(id);
  if (!workspace)
    throw new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
  deps.logger.info("workspace ensured", { userId: approved.userId, workspaceId: id });
  return workspace;
}

export async function listBrands(
  deps: WorkspaceDeps,
  principal: Principal | null,
  workspaceId: string,
  query: { includeArchived: boolean; cursor: string | null; limit: number },
): Promise<BrandPage> {
  await authorizeWorkspace(deps, principal, workspaceId);
  return deps.workspaces.listBrands(workspaceId, query);
}

export async function getBrand(
  deps: WorkspaceDeps,
  principal: Principal | null,
  workspaceId: string,
  brandId: string,
): Promise<BrandRecord> {
  await authorizeWorkspace(deps, principal, workspaceId);
  const brand = await deps.workspaces.getBrand(workspaceId, brandId);
  if (!brand || brand.workspaceId !== workspaceId) throw notFound();
  return brand;
}

export interface CreateBrandCommand {
  name: string;
  profile?: unknown;
  targets?: unknown;
}

/** Brand names are arbitrary user data (never special-cased); profile and targets are bounded JSON. */
export async function createBrand(
  deps: WorkspaceDeps,
  principal: Principal | null,
  workspaceId: string,
  command: CreateBrandCommand,
): Promise<BrandRecord> {
  const approved = await authorizeWorkspace(deps, principal, workspaceId);
  const { limits } = deps;
  const input = {
    name: parseName(command.name, limits.brandNameMaxLength, "Brand name"),
    profile: parseSettings(command.profile ?? {}, limits.brandSettingsMaxBytes, "Profile"),
    targets: parseSettings(command.targets ?? {}, limits.brandSettingsMaxBytes, "Targets"),
  };
  // Application-level cap; two simultaneous creates may briefly exceed it by one.
  if ((await deps.workspaces.countActiveBrands(workspaceId)) >= limits.maxBrandsPerWorkspace) {
    throw new AppError("CONFLICT", "The brand limit for this workspace has been reached.", {
      reason: "brand_limit",
    });
  }
  const brand = await deps.workspaces.createBrand(workspaceId, input);
  deps.logger.info("brand created", { userId: approved.userId, workspaceId, brandId: brand.id });
  return brand;
}

export interface UpdateBrandCommand {
  expectedRevision: number;
  name?: string;
  profile?: unknown;
  targets?: unknown;
  archived?: boolean;
}

/** Conditional update by expected revision. Archived brands can only be restored, not edited. */
export async function updateBrand(
  deps: WorkspaceDeps,
  principal: Principal | null,
  workspaceId: string,
  brandId: string,
  command: UpdateBrandCommand,
): Promise<BrandRecord> {
  const approved = await authorizeWorkspace(deps, principal, workspaceId);
  const { limits } = deps;
  const patch: BrandPatch = {};
  if (command.name !== undefined)
    patch.name = parseName(command.name, limits.brandNameMaxLength, "Brand name");
  if (command.profile !== undefined)
    patch.profile = parseSettings(command.profile, limits.brandSettingsMaxBytes, "Profile");
  if (command.targets !== undefined)
    patch.targets = parseSettings(command.targets, limits.brandSettingsMaxBytes, "Targets");
  if (command.archived !== undefined) patch.archived = command.archived;
  if (Object.keys(patch).length === 0) throw invalid("Nothing to update.");

  const current = await deps.workspaces.getBrand(workspaceId, brandId);
  if (!current || current.workspaceId !== workspaceId) throw notFound();
  const editsContent =
    patch.name !== undefined || patch.profile !== undefined || patch.targets !== undefined;
  if (current.archivedAt !== null && (editsContent || patch.archived !== false)) {
    throw new AppError("CONFLICT", "Archived brands must be restored before editing.", {
      reason: "brand_archived",
    });
  }
  if (current.archivedAt === null && patch.archived === false && !editsContent) {
    throw invalid("The brand is not archived.");
  }

  const updated = await deps.workspaces.updateBrand(
    workspaceId,
    brandId,
    command.expectedRevision,
    patch,
  );
  deps.logger.info("brand updated", {
    userId: approved.userId,
    workspaceId,
    brandId,
    archived: patch.archived ?? null,
  });
  return updated;
}
