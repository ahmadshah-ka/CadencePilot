import type { ReadinessCheck } from "@/application/health/check-readiness";
import type { Clock } from "@/application/ports/clock";
import type { AccessRepository } from "@/application/ports/access-repository";
import type { AuthSessionService } from "@/application/ports/auth-session";
import type { IdentityProvider } from "@/application/ports/identity";
import type { Logger } from "@/application/ports/logger";
import { SECRET_VARIABLES } from "@/config/env-schema";
import {
  describeIssues,
  parseConfig,
  type AppConfig,
  type ConfigResult,
  type EnvSource,
} from "@/config/load-config";
import { systemClock } from "@/infrastructure/clock/system-clock";
import { AppError } from "@/domain/errors/app-error";
import { createSupabaseAccessRepository } from "@/infrastructure/supabase/supabase-access-repository";
import { createSupabaseAuthSession } from "@/infrastructure/supabase/supabase-auth-session";
import { createSupabaseIdentityProvider } from "@/infrastructure/supabase/supabase-identity";
import { createLogger, type LogLevel } from "@/infrastructure/logging/logger";

const FALLBACK_LOG_LEVEL: LogLevel = "info";
const LOG_LEVEL_VALUES: readonly string[] = ["debug", "info", "warn", "error"];

function createSupabaseAdapters(
  config: AppConfig,
): Pick<Container, "identity" | "access" | "session"> {
  const settings = {
    url: config.supabase.url,
    publishableKey: config.supabase.publishableKey,
    ...(config.supabase.secretKey ? { secretKey: config.supabase.secretKey } : {}),
    secureCookies: config.app.env !== "development",
  };
  return {
    identity: createSupabaseIdentityProvider(settings),
    access: createSupabaseAccessRepository(settings),
    session: createSupabaseAuthSession(settings),
  };
}

/** Everything handlers need, built once per server process (the composition root). */
export interface Container {
  config: ConfigResult;
  logger: Logger;
  clock: Clock;
  readinessChecks: readonly ReadinessCheck[];
  identity: IdentityProvider;
  access: AccessRepository;
  session: AuthSessionService;
}

export type AdapterOverrides = Partial<Pick<Container, "identity" | "access" | "session">>;

const unavailable = (): never => {
  throw new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
};

/** Used when configuration is invalid: every call fails safely instead of reaching a provider. */
const unavailableAdapters: Pick<Container, "identity" | "access" | "session"> = {
  identity: { getIdentity: async () => unavailable() },
  access: {
    getAccount: async () => unavailable(),
    isOwner: async () => unavailable(),
    ensureAccount: async () => unavailable(),
    listAccounts: async () => unavailable(),
    review: async () => unavailable(),
  },
  session: {
    startGoogleSignIn: async () => unavailable(),
    completeSignIn: async () => unavailable(),
    signOut: async () => unavailable(),
    getMfaState: async () => unavailable(),
    enrollTotp: async () => unavailable(),
    verifyTotp: async () => unavailable(),
  },
};

/**
 * Builds the container from an environment. Invalid configuration does not throw: the process
 * stays up so /api/v1/health works, readiness reports not-ready, and the issues (variable names
 * only) are logged once.
 */
export function createContainer(env: EnvSource, overrides: AdapterOverrides = {}): Container {
  const config = parseConfig(env);

  // Scrub raw secret values even when config is invalid and the typed secret list is unavailable.
  const secrets = SECRET_VARIABLES.map((name) => env[name]).filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  );
  const requestedLevel = env.LOG_LEVEL?.trim() ?? "";
  const level = (
    LOG_LEVEL_VALUES.includes(requestedLevel) ? requestedLevel : FALLBACK_LOG_LEVEL
  ) as LogLevel;
  const logger = createLogger({ level, secrets });

  if (!config.ok) {
    logger.error("configuration invalid", { issues: describeIssues(config.issues) });
  }

  const adapters = config.ok ? createSupabaseAdapters(config.config) : unavailableAdapters;

  return {
    config,
    logger,
    identity: overrides.identity ?? adapters.identity,
    access: overrides.access ?? adapters.access,
    session: overrides.session ?? adapters.session,
    clock: systemClock,
    // Feature 02+ register database/auth probes here; none exist at foundation.
    readinessChecks: [{ name: "config", check: async () => config.ok }],
  };
}

/**
 * Next.js can load this module once per bundle (instrumentation vs route handlers), so the
 * singleton lives on globalThis to keep one container, and one config log line, per process.
 */
const CONTAINER_KEY = Symbol.for("app.container");
type ContainerHolder = { [CONTAINER_KEY]?: Container };

/** Returns the process-wide container, creating it on first use (safe under concurrent calls). */
export function getContainer(): Container {
  const holder = globalThis as ContainerHolder;
  holder[CONTAINER_KEY] ??= createContainer(process.env);
  return holder[CONTAINER_KEY];
}

/** Test hook: drops the memoized container so the next call re-reads the environment. */
export function resetContainerForTests(): void {
  delete (globalThis as ContainerHolder)[CONTAINER_KEY];
}
