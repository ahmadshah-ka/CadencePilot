import { describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors/app-error";
import { createLogger, REDACTED } from "./logger";

function capture(options: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const lines: Array<Record<string, unknown>> = [];
  const logger = createLogger({
    level: "info",
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    write: (line) => lines.push(JSON.parse(line)),
    ...options,
  });
  return { logger, lines };
}

describe("createLogger", () => {
  it("writes one JSON entry with time, level and message", () => {
    const { logger, lines } = capture();
    logger.info("hello", { count: 2 });
    expect(lines).toEqual([
      { time: "2026-01-01T00:00:00.000Z", level: "info", message: "hello", count: 2 },
    ]);
  });

  it("filters below the configured level", () => {
    const { logger, lines } = capture({ level: "warn" });
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(lines.map((l) => l.level)).toEqual(["warn", "error"]);
  });

  it("redacts sensitive field names at any depth", () => {
    const { logger, lines } = capture();
    logger.info("x", {
      apiKey: "k1",
      nested: { Authorization: "Bearer t", password: "p", prompt: "tell me", fine: "ok" },
      messages: ["hi"],
      list: [{ cookie: "c" }],
    });
    const entry = lines[0]!;
    expect(entry.apiKey).toBe(REDACTED);
    expect(entry.nested).toEqual({
      Authorization: REDACTED,
      password: REDACTED,
      prompt: REDACTED,
      fine: "ok",
    });
    expect(entry.messages).toBe(REDACTED);
    expect(entry.list).toEqual([{ cookie: REDACTED }]);
  });

  it("scrubs known secret values from messages and innocuous fields", () => {
    const { logger, lines } = capture({ secrets: ["canary-secret-123"] });
    logger.error("failed with canary-secret-123", {
      detail: "url?x=canary-secret-123",
      short: "ab",
    });
    expect(JSON.stringify(lines)).not.toContain("canary-secret-123");
    expect(lines[0]!.message).toBe(`failed with ${REDACTED}`);
  });

  it("ignores secrets too short to scrub safely", () => {
    const { logger, lines } = capture({ secrets: ["ab"] });
    logger.info("about");
    expect(lines[0]!.message).toBe("about");
  });

  it("serialises AppError safely and unknown errors by name only", () => {
    const { logger, lines } = capture({ secrets: ["canary-secret-123"] });
    logger.error("e", {
      a: new AppError("CONFLICT", "stale canary-secret-123"),
      b: new TypeError("password=hunter2"),
    });
    expect(lines[0]!.a).toEqual({
      name: "AppError",
      code: "CONFLICT",
      message: `stale ${REDACTED}`,
    });
    expect(lines[0]!.b).toEqual({ name: "TypeError" });
  });

  it("handles dates, null, functions and excessive depth", () => {
    const { logger, lines } = capture();
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: "x" } } } } } };
    logger.info("x", {
      when: new Date("2026-02-02T00:00:00.000Z"),
      nothing: null,
      fn: () => 1,
      deep,
    });
    expect(lines[0]!.when).toBe("2026-02-02T00:00:00.000Z");
    expect(lines[0]!.nothing).toBeNull();
    expect(lines[0]).not.toHaveProperty("fn");
    expect(JSON.stringify(lines[0]!.deep)).toContain("[TRUNCATED]");
  });

  it("child loggers add bindings to every entry", () => {
    const { logger, lines } = capture();
    logger.child({ traceId: "t1" }).child({ route: "r" }).info("m");
    expect(lines[0]).toMatchObject({ traceId: "t1", route: "r" });
  });
});
