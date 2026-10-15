import { z } from "zod";
import { contentPolicy } from "@/config/content-policy";
import onboarding from "@/config/onboarding-policy.json";
import {
  authorizeContent,
  listContent,
  getContent,
  contentCommand,
  type ContentDeps,
} from "@/application/content/content-use-cases";
import { getContainer, type Container } from "@/infrastructure/composition";
import { AppError } from "@/domain/errors/app-error";
import { readJson } from "./body";
import { createRouteHandler, jsonResponse, type RouteContext } from "./route-handler";
/** Dependency factory shared by API and server-rendered content pages. */
export function contentDeps(container: Container = getContainer()): ContentDeps {
  return {
    content: container.content,
    workspaces: container.workspaces,
    policy: contentPolicy,
    platforms: onboarding.platforms,
    now: () => container.clock.now(),
  };
}
const scopeSchema = z.object({ workspaceId: z.uuid(), brandId: z.uuid() });
function scopeOf(ctx: RouteContext) {
  const result = scopeSchema.safeParse(ctx.params);
  if (!result.success) throw new AppError("NOT_FOUND", "Not found.");
  return result.data;
}
/** GET list/detail/series or POST a bounded manual command; explicit approved-account policy. */
export const contentHandler = (
  kind: "list" | "detail" | "series" | "command",
  getDeps: () => Container = getContainer,
) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (ctx) => {
        const scope = scopeOf(ctx),
          deps = contentDeps(ctx.container),
          url = new URL(ctx.request.url);
        if (kind === "command") {
          if (!ctx.container.config.ok)
            throw new AppError("DEPENDENCY_UNAVAILABLE", "Unavailable.");
          const body = await readJson(
            ctx.request,
            z
              .object({
                action: z.enum([
                  "create",
                  "edit",
                  "archive",
                  "task",
                  "publication",
                  "create-series",
                  "edit-series",
                ]),
                id: z.uuid().nullable(),
                input: z.unknown(),
              })
              .strict(),
            ctx.container.config.config.limits.maxRequestBodyBytes,
          );
          const result = await contentCommand(
            deps,
            ctx.principal,
            scope,
            body.action,
            body.id,
            body.input,
          );
          return jsonResponse(result, 200, ctx.traceId);
        }
        if (kind === "detail") {
          const id = z.uuid().safeParse(ctx.params.contentId);
          if (!id.success) throw new AppError("NOT_FOUND", "Not found.");
          return jsonResponse(
            await getContent(deps, ctx.principal, scope, id.data),
            200,
            ctx.traceId,
          );
        }
        const query = z
          .object({
            cursor: z.string().max(128).nullable(),
            includeArchived: z.enum(["true", "false"]),
            parentId: z.uuid().optional(),
          })
          .safeParse({
            cursor: url.searchParams.get("cursor"),
            includeArchived: url.searchParams.get("includeArchived") ?? "false",
            parentId: url.searchParams.get("parentId") ?? undefined,
          });
        if (!query.success) throw new AppError("INVALID_REQUEST", "Invalid content query.");
        const args = {
          cursor: query.data.cursor,
          includeArchived: query.data.includeArchived === "true",
          limit: contentPolicy.listPageSize,
          parentId: query.data.parentId,
        };
        if (kind === "series") {
          await authorizeContent(deps, ctx.principal, scope);
          return jsonResponse(await deps.content.listSeries(scope, args), 200, ctx.traceId);
        }
        return jsonResponse(await listContent(deps, ctx.principal, scope, args), 200, ctx.traceId);
      },
    },
    getDeps,
  );
