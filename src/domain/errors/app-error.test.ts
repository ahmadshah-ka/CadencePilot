import { describe, expect, it } from "vitest";
import { AppError, isAppError, toErrorEnvelope } from "./app-error";

describe("toErrorEnvelope", () => {
  it("passes AppError code, message and details through", () => {
    const envelope = toErrorEnvelope(new AppError("NOT_FOUND", "Missing.", { id: "x" }));
    expect(envelope).toEqual({
      error: { code: "NOT_FOUND", message: "Missing.", details: { id: "x" } },
    });
  });

  it("omits details when none were given", () => {
    expect(toErrorEnvelope(new AppError("CONFLICT", "Stale."))).toEqual({
      error: { code: "CONFLICT", message: "Stale." },
    });
  });

  it("hides the message of unknown errors", () => {
    const envelope = toErrorEnvelope(new Error("db password=hunter2"));
    expect(envelope.error.code).toBe("INTERNAL");
    expect(JSON.stringify(envelope)).not.toContain("hunter2");
    expect(toErrorEnvelope("string thrown").error.code).toBe("INTERNAL");
  });
});

describe("isAppError", () => {
  it("recognises errors from another copy of the class (separate bundles)", () => {
    class AppError extends Error {
      code = "CONFLICT";
      constructor(message: string) {
        super(message);
        this.name = "AppError";
      }
    }
    const foreign = new AppError("stale");
    expect(foreign instanceof (globalThis as { Error: ErrorConstructor }).Error).toBe(true);
    expect(isAppError(foreign)).toBe(true);
    expect(toErrorEnvelope(foreign)).toEqual({ error: { code: "CONFLICT", message: "stale" } });
  });

  it("rejects lookalikes and unknown codes", () => {
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError({ name: "AppError", code: "NOPE", message: "x" })).toBe(false);
    expect(isAppError({ name: "AppError", code: "CONFLICT" })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError("AppError")).toBe(false);
  });
});
