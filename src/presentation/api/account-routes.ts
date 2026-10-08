import { z } from "zod";
import { listAccounts, reviewAccount } from "@/application/access/access-use-cases";
import { ACCOUNT_STATUSES, REVIEW_DECISIONS } from "@/domain/access/account-status";
import { AppError } from "@/domain/errors/app-error";
import { getContainer, type Container } from "@/infrastructure/composition";
import { readJson } from "./body";
import { createRouteHandler, jsonResponse, type RouteContext } from "./route-handler";

const userIdSchema = z.uuid();

function requireConfig({ container }: Pick<RouteContext, "container">) {
  if (!container.config.ok) {
    throw new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
  }
  return container.config.config;
}

/** GET /api/v1/me — policy: authenticated (any signed-in account, including pending). */
export const meHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "authenticated",
      handle: async ({ principal, traceId }) =>
        jsonResponse(
          {
            userId: principal.userId,
            status: principal.accountStatus,
            isOwner: principal.isOwner,
            mfaVerified: principal.mfaVerified,
          },
          200,
          traceId,
        ),
    },
    getDeps,
  );

const listQuerySchema = z.object({
  status: z.enum(ACCOUNT_STATUSES).optional(),
  cursor: z.string().max(200).optional(),
});

/** GET /api/v1/admin/accounts?status=&cursor= — policy: owner. Cursor-paginated, oldest first. */
export const listAccountsHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "owner",
      handle: async (context) => {
        const config = requireConfig(context);
        const url = new URL(context.request.url);
        const query = listQuerySchema.safeParse({
          status: url.searchParams.get("status") ?? undefined,
          cursor: url.searchParams.get("cursor") ?? undefined,
        });
        if (!query.success) throw new AppError("INVALID_REQUEST", "The query is not valid.");
        const page = await listAccounts(
          { access: context.container.access, ownerMfaRequired: config.ownerMfaRequired },
          context.principal,
          {
            status: query.data.status ?? null,
            cursor: query.data.cursor ?? null,
            limit: config.limits.listPageSize,
          },
        );
        return jsonResponse(page, 200, context.traceId);
      },
    },
    getDeps,
  );

/**
 * POST /api/v1/admin/accounts/{userId}/review — policy: owner (+MFA when configured).
 * Body: { decision, expectedRevision, note? }. Stale revisions return 409.
 */
export const reviewAccountHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "owner",
      handle: async (context) => {
        const config = requireConfig(context);
        const target = userIdSchema.safeParse(context.params.userId);
        if (!target.success) throw new AppError("NOT_FOUND", "Not found.");
        const body = await readJson(
          context.request,
          z.object({
            decision: z.enum(REVIEW_DECISIONS),
            expectedRevision: z.number().int().positive(),
            note: z.string().trim().max(config.limits.reviewNoteMaxLength).optional(),
          }),
          config.limits.maxRequestBodyBytes,
        );
        const result = await reviewAccount(
          {
            access: context.container.access,
            logger: context.logger,
            ownerMfaRequired: config.ownerMfaRequired,
          },
          context.principal,
          {
            targetUserId: target.data,
            decision: body.decision,
            expectedRevision: body.expectedRevision,
            note: body.note ?? null,
          },
        );
        return jsonResponse(result, 200, context.traceId);
      },
    },
    getDeps,
  );
