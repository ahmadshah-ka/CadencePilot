import { z } from "zod";
import {
  assistantState,
  assistantCommand,
  authorizeAssistant,
  runAssistant,
  type AssistantDeps,
} from "@/application/assistant/assistant-use-cases";
import { createAssistantDeps } from "@/infrastructure/ai/assistant-dependencies";
import { getContainer, type Container } from "@/infrastructure/composition";
import { AppError, toErrorEnvelope, isAppError } from "@/domain/errors/app-error";
import { createRouteHandler, jsonResponse } from "./route-handler";
import { readJson } from "./body";
/** Approved-session routes share live workspace/brand checks and strict Origin/body controls. */
export function assistantHandler(
  kind: "state" | "command" | "chat" | "export" | "source",
  container: () => Container = getContainer,
  dependencies: (c: Container) => AssistantDeps = createAssistantDeps,
) {
  return createRouteHandler(
    {
      policy: "approved",
      handle: async (ctx) => {
        const scope = z.object({ workspaceId: z.uuid(), brandId: z.uuid() }).safeParse(ctx.params);
        if (!scope.success) throw new AppError("NOT_FOUND", "Not found.");
        const deps = dependencies(ctx.container),
          s = scope.data,
          url = new URL(ctx.request.url);
        if (kind === "state" || kind === "export")
          return jsonResponse(
            await assistantState(
              deps,
              ctx.principal,
              s,
              url.searchParams.get("cursor"),
              kind === "export",
            ),
            200,
            ctx.traceId,
          );
        if (kind === "source") {
          const id = z.uuid().safeParse(url.searchParams.get("messageId"));
          if (!id.success) throw new AppError("NOT_FOUND", "Not found.");
          const { user } = await authorizeAssistant(deps, ctx.principal, s),
            message = await deps.repository.message(s, user.userId, id.data);
          if (!message || message.forgottenAt)
            throw new AppError("NOT_FOUND", "Source is no longer available.");
          return jsonResponse({ message }, 200, ctx.traceId);
        }
        if (!ctx.container.config.ok)
          throw new AppError("DEPENDENCY_UNAVAILABLE", "Assistant unavailable.");
        const body = await readJson(
          ctx.request,
          z.unknown(),
          ctx.container.config.config.limits.maxRequestBodyBytes,
        );
        if (kind === "command") {
          await assistantCommand(deps, ctx.principal, s, body);
          return jsonResponse({ saved: true }, 200, ctx.traceId);
        }
        // Check scope/enablement before returning streaming headers; model work remains in the response lifetime.
        await authorizeAssistant(deps, ctx.principal, s, true);
        deps.ai();
        const parsed = z
          .object({
            requestId: z.uuid(),
            text: z.string().trim().min(1).max(deps.policy.messageMaxLength),
            mode: z.enum(["chat", "onboarding"]),
            compareBrandIds: z.array(z.uuid()).max(deps.policy.comparisonBrandLimit).default([]),
          })
          .strict()
          .safeParse(body);
        if (!parsed.success) throw new AppError("INVALID_REQUEST", "Check your message.");
        const abort = new AbortController(),
          signal = AbortSignal.any([ctx.request.signal, abort.signal]),
          encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const send = async (type: string, data: unknown) => {
              signal.throwIfAborted();
              controller.enqueue(
                encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`),
              );
            };
            try {
              await runAssistant(deps, ctx.principal, s, parsed.data, ctx.traceId, signal, send);
            } catch (error) {
              const safe = isAppError(error)
                ? error
                : new AppError("DEPENDENCY_UNAVAILABLE", "The assistant could not finish.");
              ctx.logger.warn("assistant stream failed", { code: safe.code });
              if (!signal.aborted) await send("error", toErrorEnvelope(safe));
            } finally {
              if (!signal.aborted) controller.close();
            }
          },
          cancel() {
            abort.abort();
          },
        });
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store, no-transform",
            "x-content-type-options": "nosniff",
            "x-accel-buffering": "no",
          },
        });
      },
    },
    container,
  );
}
