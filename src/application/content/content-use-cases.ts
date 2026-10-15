import type {
  ContentRepository,
  ContentScope,
  ContentQuery,
} from "@/application/ports/content-repository";
import type { WorkspaceRepository } from "@/application/ports/workspace-repository";
import type { Principal } from "@/domain/access/access-policy";
import { authorizeWorkspace } from "@/application/workspaces/workspace-use-cases";
import { AppError } from "@/domain/errors/app-error";
import {
  contentSchemas,
  isActualPublication,
  requiredStages,
  type ContentPolicy,
} from "@/domain/content/content-rules";
export interface ContentDeps {
  content: ContentRepository;
  workspaces: WorkspaceRepository;
  policy: ContentPolicy;
  platforms: readonly string[];
  now: () => Date;
}
const missing = () => new AppError("NOT_FOUND", "Not found.");
/** Central scope gate: platform-owner status never substitutes for brand membership. */
export async function authorizeContent(
  deps: ContentDeps,
  principal: Principal | null,
  scope: ContentScope,
  write = false,
) {
  await authorizeWorkspace({ workspaces: deps.workspaces }, principal, scope.workspaceId);
  const brand = await deps.workspaces.getBrand(scope.workspaceId, scope.brandId);
  if (!brand || brand.workspaceId !== scope.workspaceId) throw missing();
  if (write && brand.archivedAt)
    throw new AppError("CONFLICT", "Restore the brand before changing its content.");
}
function valid<T>(
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new AppError("INVALID_REQUEST", "Check the content fields and try again.");
  return result.data;
}
/** Scoped cursor list; counts are not mixed with publication totals or AI suggestions. */
export async function listContent(
  deps: ContentDeps,
  p: Principal | null,
  scope: ContentScope,
  query: ContentQuery,
) {
  await authorizeContent(deps, p, scope);
  if (query.limit < 1 || query.limit > deps.policy.listPageSize)
    throw new AppError("INVALID_REQUEST", "Invalid page size.");
  return deps.content.list(scope, query);
}
/** The detail is always reloaded with live session authorization. */
export async function getContent(
  deps: ContentDeps,
  p: Principal | null,
  scope: ContentScope,
  id: string,
) {
  await authorizeContent(deps, p, scope);
  const result = await deps.content.detail(scope, id);
  if (
    !result ||
    result.item.workspaceId !== scope.workspaceId ||
    result.item.brandId !== scope.brandId ||
    result.item.id !== id
  )
    throw missing();
  return result;
}
/** Manual commands only. All writes reauthorize and database RPCs enforce their own scope/locking. */
export async function contentCommand(
  deps: ContentDeps,
  p: Principal | null,
  scope: ContentScope,
  action: string,
  id: string | null,
  input: unknown,
): Promise<{ id: string | null }> {
  await authorizeContent(deps, p, scope, true);
  const schemas = contentSchemas(deps.policy, deps.platforms);
  if (action === "create") {
    const command = valid(schemas.create, input);
    if (command.parentId) {
      const parent = await deps.content.detail(scope, command.parentId);
      if (
        !parent ||
        parent.item.workspaceId !== scope.workspaceId ||
        parent.item.brandId !== scope.brandId ||
        parent.item.id !== command.parentId
      )
        throw missing();
      if (parent.item.kind !== "original" || parent.item.archivedAt)
        throw new AppError("CONFLICT", "Choose an active original in this brand.");
    }
    return { id: await deps.content.create(scope, command) };
  }
  if (action === "create-series") {
    const command = valid(schemas.series, input);
    return { id: await deps.content.createSeries(scope, command.requestId, command.title) };
  }
  if (action === "edit-series") {
    const schema = schemas.archive.extend({ title: schemas.series.shape.title });
    const c = valid(schema, input);
    if (!id) throw missing();
    await deps.content.editSeries(scope, id, c.expectedRevision, c.title, c.archived);
    return { id };
  }
  if (!id) throw missing();
  const detail = await getContent(deps, p, scope, id);
  if (action !== "archive" && detail.item.archivedAt)
    throw new AppError("CONFLICT", "Restore the content before editing it.");
  switch (action) {
    case "edit":
      await deps.content.edit(scope, id, valid(schemas.edit, input));
      break;
    case "archive": {
      const c = valid(schemas.archive, input);
      await deps.content.archive(scope, id, c.expectedRevision, c.archived);
      break;
    }
    case "task": {
      const c = valid(schemas.task, input);
      if (!requiredStages(detail.item.format).includes(c.stage))
        throw new AppError("INVALID_REQUEST", "That step does not apply to this format.");
      await deps.content.setTask(scope, id, c.expectedRevision, c.stage, c.completed);
      break;
    }
    case "publication": {
      const c = valid(schemas.publication, input);
      if (!isActualPublication(c.publishedAt, deps.now()))
        throw new AppError("INVALID_REQUEST", "Actual publication cannot be in the future.");
      await deps.content.savePublication(scope, id, c);
      break;
    }
    default:
      throw new AppError("INVALID_REQUEST", "Unknown content action.");
  }
  return { id };
}
