import { z } from "zod";
import {
  createBrand,
  ensureWorkspace,
  getBrand,
  getCurrentWorkspace,
  listBrands,
  updateBrand,
  type WorkspaceDeps,
} from "@/application/workspaces/workspace-use-cases";
import { AppError } from "@/domain/errors/app-error";
import { getContainer, type Container } from "@/infrastructure/composition";
import { readJson } from "./body";
import { createRouteHandler, jsonResponse, type RouteContext } from "./route-handler";

const idSchema = z.uuid();

/** Config and use-case dependencies for the request; fails safe if configuration is invalid. */
function workspaceDeps(context: Pick<RouteContext, "container" | "logger">) {
  const { container, logger } = context;
  if (!container.config.ok) {
    throw new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
  }
  const { limits } = container.config.config;
  const deps: WorkspaceDeps = { workspaces: container.workspaces, logger, limits };
  return { deps, limits };
}

/** Path ids are untrusted: anything that is not a UUID is simply "not found". */
function pathId(params: RouteContext["params"], key: string): string {
  const parsed = idSchema.safeParse(params[key]);
  if (!parsed.success) throw new AppError("NOT_FOUND", "Not found.");
  return parsed.data;
}

/** GET /api/v1/workspaces/current — policy: approved. */
export const currentWorkspaceHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (context) => {
        const { deps } = workspaceDeps(context);
        const workspace = await getCurrentWorkspace(deps, context.principal);
        return jsonResponse({ workspace }, 200, context.traceId);
      },
    },
    getDeps,
  );

/** POST /api/v1/workspaces { name } — policy: approved. Idempotent: returns the existing workspace. */
export const ensureWorkspaceHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (context) => {
        const { deps, limits } = workspaceDeps(context);
        const body = await readJson(
          context.request,
          z.object({ name: z.string() }),
          limits.maxRequestBodyBytes,
        );
        const workspace = await ensureWorkspace(deps, context.principal, body.name);
        return jsonResponse({ workspace }, 200, context.traceId);
      },
    },
    getDeps,
  );

const listQuery = z.object({
  includeArchived: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/workspaces/{workspaceId}/brands — policy: approved + membership of that workspace. */
export const listBrandsHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (context) => {
        const { deps, limits } = workspaceDeps(context);
        const workspaceId = pathId(context.params, "workspaceId");
        const url = new URL(context.request.url);
        const query = listQuery.safeParse({
          includeArchived: url.searchParams.get("includeArchived") ?? undefined,
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        if (!query.success) throw new AppError("INVALID_REQUEST", "The query is not valid.");
        const page = await listBrands(deps, context.principal, workspaceId, {
          includeArchived: query.data.includeArchived === "true",
          cursor: query.data.cursor ?? null,
          limit: limits.listPageSize,
        });
        return jsonResponse(page, 200, context.traceId);
      },
    },
    getDeps,
  );

const createBody = z.object({
  name: z.string(),
  profile: z.record(z.string(), z.unknown()).optional(),
  targets: z.record(z.string(), z.unknown()).optional(),
});

/** POST /api/v1/workspaces/{workspaceId}/brands — policy: approved + membership. */
export const createBrandHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (context) => {
        const { deps, limits } = workspaceDeps(context);
        const workspaceId = pathId(context.params, "workspaceId");
        const body = await readJson(context.request, createBody, limits.maxRequestBodyBytes);
        const brand = await createBrand(deps, context.principal, workspaceId, body);
        return jsonResponse({ brand }, 201, context.traceId);
      },
    },
    getDeps,
  );

/** GET /api/v1/workspaces/{workspaceId}/brands/{brandId} — policy: approved + membership. */
export const getBrandHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (context) => {
        const { deps } = workspaceDeps(context);
        const brand = await getBrand(
          deps,
          context.principal,
          pathId(context.params, "workspaceId"),
          pathId(context.params, "brandId"),
        );
        return jsonResponse({ brand }, 200, context.traceId);
      },
    },
    getDeps,
  );

const patchBody = z.object({
  expectedRevision: z.number().int().positive(),
  name: z.string().optional(),
  profile: z.record(z.string(), z.unknown()).optional(),
  targets: z.record(z.string(), z.unknown()).optional(),
  archived: z.boolean().optional(),
});

/** PATCH /api/v1/workspaces/{workspaceId}/brands/{brandId} — conditional on expectedRevision. */
export const updateBrandHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (context) => {
        const { deps, limits } = workspaceDeps(context);
        const body = await readJson(context.request, patchBody, limits.maxRequestBodyBytes);
        const brand = await updateBrand(
          deps,
          context.principal,
          pathId(context.params, "workspaceId"),
          pathId(context.params, "brandId"),
          body,
        );
        return jsonResponse({ brand }, 200, context.traceId);
      },
    },
    getDeps,
  );
