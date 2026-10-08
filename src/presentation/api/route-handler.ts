import { AppError, toErrorEnvelope, type ErrorCode } from "@/domain/errors/app-error";
import type { Logger } from "@/application/ports/logger";
import type { Container } from "@/infrastructure/composition";

/**
 * Every route declares its access policy explicitly. Only "public" exists until feature 02 adds
 * authenticated and owner policies; a handler cannot be created without choosing one.
 */
export type AccessPolicy = "public";

export interface RouteContext {
  request: Request;
  traceId: string;
  logger: Logger;
  container: Container;
}

export interface RouteDefinition {
  policy: AccessPolicy;
  handle(context: RouteContext): Promise<Response>;
}

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  CONFIG_INVALID: 500,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL: 500,
};

const TRACE_HEADER = "x-trace-id";

/** Builds a JSON response that must never be cached by shared caches. */
export function jsonResponse(body: unknown, status: number, traceId: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      [TRACE_HEADER]: traceId,
    },
  });
}

/**
 * Wraps a handler with trace IDs, request logging and uniform error envelopes.
 *
 * @param definition Declared policy and the handler body.
 * @param getContainer Supplies dependencies per request (injected for tests).
 * @returns A Route Handler function.
 */
export function createRouteHandler(
  definition: RouteDefinition,
  getContainer: () => Container,
): (request: Request) => Promise<Response> {
  return async (request) => {
    // Never trust a caller-supplied trace ID: it would let clients forge log correlation.
    const traceId = crypto.randomUUID();
    let container: Container;
    try {
      container = getContainer();
    } catch {
      return jsonResponse(toErrorEnvelope(new AppError("INTERNAL", "unavailable")), 500, traceId);
    }
    const logger = container.logger.child({ traceId });
    const started = container.clock.now().getTime();
    try {
      const response = await definition.handle({ request, traceId, logger, container });
      response.headers.set(TRACE_HEADER, traceId);
      logger.info("request completed", {
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        policy: definition.policy,
        durationMs: container.clock.now().getTime() - started,
      });
      return response;
    } catch (error) {
      const envelope = toErrorEnvelope(error);
      const status = STATUS_BY_CODE[envelope.error.code];
      logger.error("request failed", {
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        error,
      });
      return jsonResponse(envelope, status, traceId);
    }
  };
}
