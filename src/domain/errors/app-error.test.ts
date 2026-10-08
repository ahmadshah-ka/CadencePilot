import { describe, expect, it } from "vitest";
import { AppError, toErrorEnvelope } from "./app-error";

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
