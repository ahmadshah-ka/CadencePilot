import { describe, expect, it } from "vitest";
import { mapDatabaseError } from "./db-errors";

describe("mapDatabaseError", () => {
  it.each([
    [{ message: "stale_revision", code: "CP001" }, "CONFLICT"],
    [{ message: "invalid_transition", code: "CP002" }, "CONFLICT"],
    [{ message: "not_found", code: "P0002" }, "NOT_FOUND"],
    [{ message: "forbidden", code: "42501" }, "FORBIDDEN"],
    [{ message: "self_review_not_allowed" }, "FORBIDDEN"],
    [{ message: "invalid_decision" }, "INVALID_REQUEST"],
    [{ message: "invalid_name", code: "22023" }, "INVALID_REQUEST"],
    [{ message: "duplicate key", code: "23505" }, "CONFLICT"],
  ] as const)("maps %j to %s", (error, code) => {
    expect(mapDatabaseError(error).code).toBe(code);
  });

  it("never leaks unknown driver text", () => {
    const mapped = mapDatabaseError({ message: "connection to 10.0.0.5 failed: password=hunter2" });
    expect(mapped.code).toBe("DEPENDENCY_UNAVAILABLE");
    expect(JSON.stringify(mapped)).not.toContain("hunter2");
    expect(mapped.message).not.toContain("10.0.0.5");
  });

  it("handles an empty error", () => {
    expect(mapDatabaseError({}).code).toBe("DEPENDENCY_UNAVAILABLE");
  });
});
