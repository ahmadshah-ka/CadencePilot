import { describe, expect, it } from "vitest";
import { AppError } from "@/domain/errors/app-error";
import { describeIssues, loadConfig, parseConfig } from "./load-config";

const CORE = {
  APP_NAME: "Test App",
  APP_URL: "http://localhost:3000/",
  NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-placeholder",
};

describe("parseConfig", () => {
  it("accepts core settings with defaults and optional services disabled", () => {
    const result = parseConfig(CORE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.app).toEqual({
      name: "Test App",
      env: "development",
      url: "http://localhost:3000",
    });
    expect(result.config.llm.enabled).toBe(false);
    expect(result.config.research.enabled).toBe(false);
    expect(result.config.notifications.emailEnabled).toBe(false);
    expect(result.config.ownerMfaRequired).toBe(true);
    expect(result.config.env.LIST_PAGE_SIZE).toBe(25);
  });

  it("treats blank values as unset, as shipped in .env.example", () => {
    const result = parseConfig({ ...CORE, LLM_API_KEY: "", EMAIL_FROM: "  ", QUEUE_NAME: "" });
    expect(result.ok).toBe(true);
  });

  it("reports every missing core variable by name", () => {
    const result = parseConfig({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const names = result.issues.map((issue) => issue.variable);
    expect(names).toEqual(
      expect.arrayContaining([
        "APP_NAME",
        "APP_URL",
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ]),
    );
  });

  it("rejects invalid values without echoing them", () => {
    const bad = "definitely-not-a-url-CANARY123";
    const result = parseConfig({ ...CORE, APP_URL: bad, LOG_LEVEL: "loud", LIST_PAGE_SIZE: "-4" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.map((i) => i.variable)).toEqual(
      expect.arrayContaining(["APP_URL", "LOG_LEVEL", "LIST_PAGE_SIZE"]),
    );
    expect(JSON.stringify(result.issues)).not.toContain("CANARY123");
    expect(JSON.stringify(result.issues)).not.toContain("loud");
  });

  it("rejects non-http URL schemes", () => {
    expect(parseConfig({ ...CORE, APP_URL: "javascript:alert(1)" }).ok).toBe(false);
  });

  it("requires credentials and caps only when a service is enabled", () => {
    const result = parseConfig({
      ...CORE,
      LLM_ENABLED: "true",
      RESEARCH_ENABLED: "true",
      NOTIFICATION_EMAIL_ENABLED: "true",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    const names = result.issues.map((i) => i.variable);
    expect(names).toEqual(
      expect.arrayContaining([
        "LLM_API_KEY",
        "LLM_GLOBAL_DAILY_TOKEN_CAP",
        "RESEARCH_API_KEY",
        "EMAIL_API_KEY",
        "EMAIL_FROM",
      ]),
    );
  });

  it("accepts a fully specified enabled service and collects secrets", () => {
    const result = parseConfig({
      ...CORE,
      SUPABASE_SECRET_KEY: "sb-secret-value",
      LLM_ENABLED: "true",
      LLM_API_KEY: "llm-secret-value",
      LLM_GLOBAL_DAILY_TOKEN_CAP: "1000",
      LLM_WORKSPACE_DAILY_TOKEN_CAP: "500",
      LLM_GLOBAL_TOKENS_PER_MINUTE: "100",
      LLM_GLOBAL_REQUESTS_PER_MINUTE: "10",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.secretValues).toEqual(["sb-secret-value", "llm-secret-value"]);
    expect(result.config.supabase.secretKey).toBe("sb-secret-value");
  });

  it("rejects a workspace cap above the global cap", () => {
    const result = parseConfig({
      ...CORE,
      LLM_GLOBAL_DAILY_TOKEN_CAP: "100",
      LLM_WORKSPACE_DAILY_TOKEN_CAP: "200",
    });
    expect(result.ok).toBe(false);
  });
});

describe("loadConfig", () => {
  it("returns config when valid", () => {
    expect(loadConfig(CORE).app.name).toBe("Test App");
  });

  it("throws a CONFIG_INVALID AppError with variable names only", () => {
    try {
      loadConfig({ ...CORE, APP_URL: "nope-SECRETISH" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.code).toBe("CONFIG_INVALID");
      expect(JSON.stringify(appError.details)).toContain("APP_URL");
      expect(JSON.stringify(appError.details)).not.toContain("SECRETISH");
    }
  });
});

describe("describeIssues", () => {
  it("formats one line per issue", () => {
    expect(describeIssues([{ variable: "A", problem: "is required" }])).toEqual(["A: is required"]);
  });
});
