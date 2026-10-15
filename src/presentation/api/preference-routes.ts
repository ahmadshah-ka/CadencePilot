import { z } from "zod";
import policy from "@/config/onboarding-policy.json";
import {
  getPreferences,
  savePreferences,
  saveBrandPreferences,
} from "@/application/preferences/preference-use-cases";
import { getContainer, type Container } from "@/infrastructure/composition";
import { AppError } from "@/domain/errors/app-error";
import { createRouteHandler, jsonResponse } from "./route-handler";
import { readJson } from "./body";

const command = z
  .object({ expectedRevision: z.number().int().min(0), settings: z.unknown() })
  .strict();
/** GET creator draft, derived from the session. Policy: approved. */
export const getPreferencesHandler = (container: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (ctx) =>
        jsonResponse(
          {
            preferences: await getPreferences(
              { preferences: ctx.container.preferences, policy },
              ctx.principal,
            ),
          },
          200,
          ctx.traceId,
        ),
    },
    container,
  );
/** PUT complete partial draft. Origin validation/body limits/access handled centrally. */
export const putPreferencesHandler = (container: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (ctx) => {
        if (!ctx.container.config.ok) throw new AppError("DEPENDENCY_UNAVAILABLE", "Unavailable.");
        const body = await readJson(
          ctx.request,
          command,
          ctx.container.config.config.limits.maxRequestBodyBytes,
        );
        const preferences = await savePreferences(
          { preferences: ctx.container.preferences, policy },
          ctx.principal,
          body.expectedRevision,
          body.settings,
        );
        return jsonResponse({ preferences }, 200, ctx.traceId);
      },
    },
    container,
  );
/** PUT one brand's questionnaire. Foreign/malformed workspace/brand IDs are not found. */
export const putBrandPreferencesHandler = (container: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "approved",
      handle: async (ctx) => {
        if (!ctx.container.config.ok) throw new AppError("DEPENDENCY_UNAVAILABLE", "Unavailable.");
        const ids = z.object({ workspaceId: z.uuid(), brandId: z.uuid() }).safeParse(ctx.params);
        if (!ids.success) throw new AppError("NOT_FOUND", "Not found.");
        const config = ctx.container.config.config;
        const body = await readJson(ctx.request, command, config.limits.maxRequestBodyBytes);
        const brand = await saveBrandPreferences(
          { workspaces: ctx.container.workspaces, logger: ctx.logger, limits: config.limits },
          policy,
          ctx.principal,
          ids.data.workspaceId,
          ids.data.brandId,
          body.expectedRevision,
          body.settings,
        );
        return jsonResponse({ brand }, 200, ctx.traceId);
      },
    },
    container,
  );
