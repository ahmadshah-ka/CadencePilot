import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_READINESS_TIMEOUT_MS } from "@/config/env-schema";
import { AppError } from "@/domain/errors/app-error";
import {
  createContainer,
  getContainer,
  resetContainerForTests,
} from "@/infrastructure/composition";
import { livenessHandler, readinessHandler } from "@/presentation/api/health-routes";
import { createRouteHandler } from "@/presentation/api/route-handler";

const CANARY = "canary-supabase-secret-7f3a";
const VALID_ENV = {
  APP_NAME: "Test App",
  APP_URL: "http://localhost:3000",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-placeholder",
  SUPABASE_SECRET_KEY: CANARY,
};
const req = (path: string) => new Request(`http://localhost${path}`);

function spyOnConsole() {
  const out: string[] = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => void out.push(line));
  vi.spyOn(console, "error").mockImplementation((line: string) => void out.push(line));
  return out;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resetContainerForTests();
});

describe("GET /api/v1/health", () => {
  it("answers 200 with only a status, even when configuration is invalid", async () => {
    spyOnConsole();
    const res = await livenessHandler(() => createContainer({}))(req("/api/v1/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-trace-id")).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("GET /api/v1/ready", () => {
  it("is ready with valid configuration and optional services disabled", async () => {
    spyOnConsole();
    const res = await readinessHandler(() => createContainer(VALID_ENV))(req("/api/v1/ready"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ready" });
  });

  it("is 503 with a minimal envelope and logs names, not values, when config is missing", async () => {
    const out = spyOnConsole();
    const res = await readinessHandler(() => createContainer({ SUPABASE_SECRET_KEY: CANARY }))(
      req("/api/v1/ready"),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      error: { code: "DEPENDENCY_UNAVAILABLE", message: "Service is not ready." },
    });
    const logs = out.join("\n");
    expect(logs).toContain("APP_NAME");
    expect(logs).not.toContain(CANARY);
  });

  it("is 503 when a registered dependency is unavailable", async () => {
    spyOnConsole();
    const container = {
      ...createContainer(VALID_ENV),
      readinessChecks: [{ name: "db", check: async () => false }],
    };
    const res = await readinessHandler(() => container)(req("/api/v1/ready"));
    expect(res.status).toBe(503);
  });

  it("falls back to the default timeout when configuration is invalid", async () => {
    spyOnConsole();
    const hang = { name: "hang", check: () => new Promise<boolean>(() => {}) };
    const container = { ...createContainer({}), readinessChecks: [hang] };
    vi.useFakeTimers();
    const pending = readinessHandler(() => container)(req("/api/v1/ready"));
    await vi.advanceTimersByTimeAsync(DEFAULT_READINESS_TIMEOUT_MS + 1);
    expect((await pending).status).toBe(503);
  });
});

describe("route handler", () => {
  it("returns a safe INTERNAL envelope when a handler throws, never the error text", async () => {
    const out = spyOnConsole();
    const handler = createRouteHandler(
      {
        policy: "public",
        handle: async () => {
          throw new Error(`leak ${CANARY}`);
        },
      },
      () => createContainer(VALID_ENV),
    );
    const res = await handler(req("/x"));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: { code: "INTERNAL", message: "An unexpected error occurred." },
    });
    expect(out.join("\n")).not.toContain(CANARY);
  });

  it("maps AppError codes to statuses", async () => {
    spyOnConsole();
    const handler = createRouteHandler(
      {
        policy: "public",
        handle: async () => {
          throw new AppError("NOT_FOUND", "Nope.");
        },
      },
      () => createContainer(VALID_ENV),
    );
    expect((await handler(req("/x"))).status).toBe(404);
  });

  it("fails safely if the container cannot be built", async () => {
    const handler = createRouteHandler(
      { policy: "public", handle: async () => new Response("never") },
      () => {
        throw new Error("boom");
      },
    );
    const res = await handler(req("/x"));
    expect(res.status).toBe(500);
    expect((await res.json()).error.code).toBe("INTERNAL");
  });
});

describe("getContainer", () => {
  it("memoises so concurrent startup shares one instance", async () => {
    spyOnConsole();
    vi.stubEnv("APP_NAME", "Test App");
    const results = await Promise.all(Array.from({ length: 10 }, async () => getContainer()));
    expect(new Set(results).size).toBe(1);
  });
});
