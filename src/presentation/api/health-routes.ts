import { checkReadiness } from "@/application/health/check-readiness";
import { DEFAULT_READINESS_TIMEOUT_MS } from "@/config/env-schema";
import { AppError, toErrorEnvelope } from "@/domain/errors/app-error";
import { getContainer, type Container } from "@/infrastructure/composition";
import { createRouteHandler, jsonResponse } from "./route-handler";

/**
 * Liveness: public, unauthenticated, reveals only that the process is up. It deliberately does not
 * touch configuration or dependencies so it keeps answering when they are broken.
 */
export const livenessHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "public",
      handle: async ({ traceId }) => jsonResponse({ status: "ok" }, 200, traceId),
    },
    getDeps,
  );

/**
 * Readiness: public, unauthenticated, returns only ready / not ready. Failed check names and
 * configuration problems go to server logs, never the response.
 */
export const readinessHandler = (getDeps: () => Container = getContainer) =>
  createRouteHandler(
    {
      policy: "public",
      handle: async ({ traceId, logger, container }) => {
        const report = await checkReadiness({
          checks: container.readinessChecks,
          timeoutMs: container.config.ok
            ? container.config.config.readiness.timeoutMs
            : DEFAULT_READINESS_TIMEOUT_MS,
          clock: container.clock,
          logger,
        });
        if (report.ready) return jsonResponse({ status: "ready" }, 200, traceId);
        return jsonResponse(
          toErrorEnvelope(new AppError("DEPENDENCY_UNAVAILABLE", "Service is not ready.")),
          503,
          traceId,
        );
      },
    },
    getDeps,
  );
