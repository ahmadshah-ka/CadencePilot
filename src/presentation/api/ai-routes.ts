import { z } from "zod";
import { runAi, type AiDeps } from "@/application/ai/run-ai";
import { getContainer, type Container } from "@/infrastructure/composition";
import { createAiDeps } from "@/infrastructure/ai/ai-dependencies";
import { loadProbePrompt, probeOutput, PROBE_VERSION } from "@/infrastructure/ai/prompts";
import { AppError } from "@/domain/errors/app-error";
import { readJson } from "./body";
import { createRouteHandler, jsonResponse } from "./route-handler";
/** Owner-only controlled smoke call: fixed harmless prompt, live membership, MFA, Origin and persistent budgets.
 * Duplicate request UUID is denied, not dispatched again. No arbitrary prompts or cap overrides accepted. */
export function aiProbeHandler(
  container: () => Container = getContainer,
  dependencies: (c: Container) => AiDeps = createAiDeps,
) {
  return createRouteHandler(
    {
      policy: "owner",
      handle: async (ctx) => {
        const parsed = z.object({ workspaceId: z.uuid(), brandId: z.uuid() }).safeParse(ctx.params);
        if (!parsed.success) throw new AppError("NOT_FOUND", "Not found.");
        if (!ctx.container.config.ok)
          throw new AppError("DEPENDENCY_UNAVAILABLE", "AI unavailable.");
        const body = await readJson(
          ctx.request,
          z.object({ requestId: z.uuid() }).strict(),
          ctx.container.config.config.limits.maxRequestBodyBytes,
        );
        const result = await runAi(dependencies(ctx.container), ctx.principal, {
          ...parsed.data,
          requestId: body.requestId,
          traceId: ctx.traceId,
          promptVersion: PROBE_VERSION,
          messages: [
            { role: "system", content: await loadProbePrompt() },
            { role: "user", content: "Check the connection." },
          ],
          output: probeOutput,
          signal: ctx.request.signal,
        });
        return jsonResponse({ status: "ok", usage: result.usage }, 200, ctx.traceId);
      },
    },
    container,
  );
}
