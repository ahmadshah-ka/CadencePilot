import { assertAccess, resolvePrincipal } from "@/application/access/access-use-cases";
import type { Logger } from "@/application/ports/logger";
import type { AccessRequirement, Principal } from "@/domain/access/access-policy";
import { AppError, toErrorEnvelope, type ErrorCode } from "@/domain/errors/app-error";
import type { Container } from "@/infrastructure/composition";

/**
 * Every route declares its access policy explicitly; a handler cannot be created without one.
 * - public: no session needed (health, readiness)
 * - authenticated: any signed-in user regardless of approval (e.g. "who am I")
 * - approved: approved account only; the default for product APIs
 * - owner: approved platform owner, with MFA when configured
 */
export type AccessPolicy = "public" | "authenticated" | "approved" | "owner";

type PrincipalFor<P extends AccessPolicy> = P extends "public" ? null : Principal;

export interface RouteContext<P extends AccessPolicy = AccessPolicy> {
  request: Request;
  traceId: string;
  logger: Logger;
  container: Container;
  /** Dynamic route segments, already awaited. Treat as untrusted input. */
  params: Readonly<Record<string, string>>;
  principal: PrincipalFor<P>;
}

export interface RouteDefinition<P extends AccessPolicy> {
  policy: P;
  handle(context: RouteContext<P>): Promise<Response>;
}

export interface NextRouteContext {
  params?: Promise<Record<string, string | string[] | undefined>>;
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
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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

function requirementFor(
  policy: Exclude<AccessPolicy, "public">,
  mfaRequired: boolean,
): AccessRequirement {
  if (policy === "owner") return { kind: "owner", mfaRequired };
  return { kind: policy };
}

/**
 * Cookie-authenticated mutations must come from our own origin (CSRF defence in depth on top of
 * SameSite=Lax cookies). Browsers always send Origin on cross-site and same-site POSTs.
 */
function assertSameOrigin(request: Request, appUrl: string): void {
  if (SAFE_METHODS.has(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(appUrl).origin) {
    throw new AppError("FORBIDDEN", "Request origin is not allowed.", { reason: "bad_origin" });
  }
}

async function resolveParams(
  routeContext: NextRouteContext | undefined,
): Promise<Record<string, string>> {
  const raw = (await routeContext?.params) ?? {};
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") params[key] = value;
  }
  return params;
}

/**
 * Wraps a handler with trace IDs, access-policy enforcement, origin checks, request logging and
 * uniform error envelopes.
 *
 * @param definition Declared policy and the handler body.
 * @param getContainer Supplies dependencies per request (injected for tests).
 * @returns A Route Handler function.
 */
export function createRouteHandler<P extends AccessPolicy>(
  definition: RouteDefinition<P>,
  getContainer: () => Container,
): (request: Request, routeContext?: NextRouteContext) => Promise<Response> {
  return async (request, routeContext) => {
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
    const path = new URL(request.url).pathname;
    try {
      let principal: Principal | null = null;
      if (definition.policy !== "public") {
        if (!container.config.ok) {
          throw new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
        }
        const { app, ownerMfaRequired } = container.config.config;
        assertSameOrigin(request, app.url);
        principal = await resolvePrincipal({
          identity: container.identity,
          access: container.access,
          logger,
        });
        try {
          assertAccess(principal, requirementFor(definition.policy, ownerMfaRequired));
        } catch (denied) {
          logger.warn("access denied", {
            path,
            userId: principal?.userId ?? null,
            reason: denied instanceof AppError ? denied.details?.reason : undefined,
          });
          throw denied;
        }
      }

      const response = await definition.handle({
        request,
        traceId,
        logger,
        container,
        params: await resolveParams(routeContext),
        principal: principal as PrincipalFor<P>,
      });
      response.headers.set(TRACE_HEADER, traceId);
      logger.info("request completed", {
        method: request.method,
        path,
        status: response.status,
        policy: definition.policy,
        durationMs: container.clock.now().getTime() - started,
      });
      return response;
    } catch (error) {
      const envelope = toErrorEnvelope(error);
      const status = STATUS_BY_CODE[envelope.error.code];
      // Caller mistakes (4xx) are expected traffic; only server-side failures are errors.
      const log = status >= 500 ? logger.error : logger.warn;
      log("request failed", { method: request.method, path, status, error });
      return jsonResponse(envelope, status, traceId);
    }
  };
}
