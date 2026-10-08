import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT_PATH, sanitizeNextPath } from "./safe-redirect";

describe("sanitizeNextPath", () => {
  it("keeps allowed same-site paths with their query", () => {
    expect(sanitizeNextPath("/app")).toBe("/app");
    expect(sanitizeNextPath("/app/calendar?week=3")).toBe("/app/calendar?week=3");
    expect(sanitizeNextPath("/admin/review?x=1")).toBe("/admin/review?x=1");
  });

  it.each([
    "https://evil.example/app",
    "//evil.example/app",
    "/\\evil.example",
    "/app\r\nSet-Cookie: x=1",
    "javascript:alert(1)",
    "/application",
    "/sign-in",
    "app",
    "",
    "/app/../../etc",
  ])("falls back to the default for %j", (value) => {
    expect(sanitizeNextPath(value)).toBe(DEFAULT_REDIRECT_PATH);
  });

  it("handles null and undefined", () => {
    expect(sanitizeNextPath(null)).toBe(DEFAULT_REDIRECT_PATH);
    expect(sanitizeNextPath(undefined)).toBe(DEFAULT_REDIRECT_PATH);
  });
});
