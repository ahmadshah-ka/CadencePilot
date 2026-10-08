import { describe, expect, it, vi } from "vitest";
import type { Logger } from "@/application/ports/logger";
import { checkReadiness, type ReadinessCheck } from "./check-readiness";

const fixedNow = new Date("2026-01-02T03:04:05.000Z");
const clock = { now: () => fixedNow };
function fakeLogger(): Logger {
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
  };
  return logger;
}
const run = (checks: ReadinessCheck[], timeoutMs = 50, logger = fakeLogger()) =>
  checkReadiness({ checks, timeoutMs, clock, logger });

describe("checkReadiness", () => {
  it("is ready with no checks and uses the injected clock", async () => {
    const report = await run([]);
    expect(report).toEqual({ ready: true, checkedAt: fixedNow, failed: [] });
  });

  it("is ready when all checks pass", async () => {
    expect((await run([{ name: "a", check: async () => true }])).ready).toBe(true);
  });

  it("fails when a check returns false, naming it only in logs", async () => {
    const logger = fakeLogger();
    const report = await run([{ name: "db", check: async () => false }], 50, logger);
    expect(report.ready).toBe(false);
    expect(report.failed).toEqual(["db"]);
    expect(logger.warn).toHaveBeenCalledWith("readiness check failed", { failed: ["db"] });
  });

  it("treats a rejected or synchronously throwing check as unavailable", async () => {
    const report = await run([
      { name: "rejects", check: () => Promise.reject(new Error("secret detail")) },
      {
        name: "throws",
        check: () => {
          throw new Error("boom");
        },
      },
    ]);
    expect(report.failed).toEqual(["rejects", "throws"]);
  });

  it("treats a hung check as unavailable after the timeout", async () => {
    const report = await run([{ name: "hung", check: () => new Promise<boolean>(() => {}) }], 20);
    expect(report.ready).toBe(false);
    expect(report.failed).toEqual(["hung"]);
  });
});
