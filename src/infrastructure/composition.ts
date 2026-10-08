import type { ReadinessCheck } from "@/application/health/check-readiness";
import type { Clock } from "@/application/ports/clock";
import type { Logger } from "@/application/ports/logger";
import { SECRET_VARIABLES } from "@/config/env-schema";
import {
  describeIssues,
  parseConfig,
  type ConfigResult,
  type EnvSource,
} from "@/config/load-config";
import { systemClock } from "@/infrastructure/clock/system-clock";
import { createLogger, type LogLevel } from "@/infrastructure/logging/logger";

const FALLBACK_LOG_LEVEL: LogLevel = "info";
const LOG_LEVEL_VALUES: readonly string[] = ["debug", "info", "warn", "error"];

/** Everything handlers need, built once per server process (the composition root). */
export interface Container {
  config: ConfigResult;
  logger: Logger;
  clock: Clock;
  readinessChecks: readonly ReadinessCheck[];
}

/**
 * Builds the container from an environment. Invalid configuration does not throw: the process
 * stays up so /api/v1/health works, readiness reports not-ready, and the issues (variable names
 * only) are logged once.
 */
export function createContainer(env: EnvSource): Container {
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

  return {
    config,
    logger,
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
