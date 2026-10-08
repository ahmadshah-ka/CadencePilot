import type { Clock } from "@/application/ports/clock";
import type { Logger } from "@/application/ports/logger";

/** A dependency probe. Returns true when healthy; a throw or false counts as unavailable. */
export interface ReadinessCheck {
  name: string;
  check(): Promise<boolean>;
}

export interface ReadinessReport {
  ready: boolean;
  checkedAt: Date;
  /** Names of failed checks, for server logs only. */
  failed: string[];
}

export interface ReadinessDeps {
  checks: readonly ReadinessCheck[];
  timeoutMs: number;
  clock: Clock;
  logger: Logger;
}

async function runWithTimeout(check: ReadinessCheck, timeoutMs: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    const probe = Promise.resolve()
      .then(() => check.check())
      .catch(() => false);
    return await Promise.race([probe, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs every readiness check in parallel, each bounded by the configured timeout.
 *
 * @returns Ready only if all checks pass; failures are logged by name, never with details.
 */
export async function checkReadiness(deps: ReadinessDeps): Promise<ReadinessReport> {
  const results = await Promise.all(
    deps.checks.map(async (check) => ({
      name: check.name,
      ok: await runWithTimeout(check, deps.timeoutMs),
    })),
  );
  const failed = results.filter((result) => !result.ok).map((result) => result.name);
  if (failed.length > 0) deps.logger.warn("readiness check failed", { failed });
  return { ready: failed.length === 0, checkedAt: deps.clock.now(), failed };
}
