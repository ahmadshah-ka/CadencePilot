import { AppError } from "@/domain/errors/app-error";
import {
  DB_MAX_JSON_BYTES,
  DB_MAX_NAME_LENGTH,
  DB_MAX_NOTE_LENGTH,
  ENABLED_SERVICE_REQUIREMENTS,
  SECRET_VARIABLES,
  envSchema,
  type RawEnv,
} from "./env-schema";

export type EnvSource = Readonly<Record<string, string | undefined>>;

export interface ConfigIssue {
  /** Environment variable name. Values are never included. */
  variable: string;
  problem: string;
}

export interface AppConfig {
  app: { name: string; env: RawEnv["APP_ENV"]; url: string };
  log: { level: RawEnv["LOG_LEVEL"] };
  readiness: { timeoutMs: number };
  supabase: { url: string; publishableKey: string; secretKey?: string };
  llm: { enabled: boolean };
  research: { enabled: boolean };
  notifications: { emailEnabled: boolean };
  ownerMfaRequired: boolean;
  limits: {
    workspaceNameMaxLength: number;
    brandNameMaxLength: number;
    brandSettingsMaxBytes: number;
    maxBrandsPerWorkspace: number;
    reviewNoteMaxLength: number;
    maxRequestBodyBytes: number;
    listPageSize: number;
  };
  /** Raw validated settings for adapters introduced by later features. */
  env: RawEnv;
  /** Secret values, kept only so the logger can scrub them from output. */
  secretValues: readonly string[];
}

export type ConfigResult =
  { ok: true; config: AppConfig } | { ok: false; issues: readonly ConfigIssue[] };

/** Treats blank values (as shipped in .env.example) as unset. */
function withoutBlanks(source: EnvSource): Record<string, string | undefined> {
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    cleaned[key] = value === undefined || value.trim() === "" ? undefined : value.trim();
  }
  return cleaned;
}

/**
 * Validates environment variables without throwing. Issues name the variable and the problem only,
 * so they are safe to log and print.
 *
 * @param source Environment variables, normally process.env.
 * @returns The typed configuration, or every issue found.
 */
export function parseConfig(source: EnvSource): ConfigResult {
  const parsed = envSchema.safeParse(withoutBlanks(source));
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        variable: String(issue.path[0] ?? "environment"),
        problem: issue.message,
      })),
    };
  }

  const env = parsed.data;
  const issues: ConfigIssue[] = [];

  for (const { flag, required } of ENABLED_SERVICE_REQUIREMENTS) {
    if (!env[flag]) continue;
    for (const variable of required) {
      if (env[variable] === undefined) {
        issues.push({ variable, problem: `is required when ${flag}=true` });
      }
    }
  }
  if (
    env.LLM_GLOBAL_DAILY_TOKEN_CAP !== undefined &&
    env.LLM_WORKSPACE_DAILY_TOKEN_CAP !== undefined &&
    env.LLM_WORKSPACE_DAILY_TOKEN_CAP > env.LLM_GLOBAL_DAILY_TOKEN_CAP
  ) {
    issues.push({
      variable: "LLM_WORKSPACE_DAILY_TOKEN_CAP",
      problem: "must not exceed LLM_GLOBAL_DAILY_TOKEN_CAP",
    });
  }
  if (env.APP_ENV !== "development" && env.SUPABASE_SECRET_KEY === undefined) {
    issues.push({
      variable: "SUPABASE_SECRET_KEY",
      problem: "is required when APP_ENV is staging or production",
    });
  }
  if (env.APP_ENV === "production" && !env.OWNER_MFA_REQUIRED) {
    issues.push({
      variable: "OWNER_MFA_REQUIRED",
      problem: "must be true when APP_ENV=production",
    });
  }
  const ceilings: Array<[keyof RawEnv, number, number]> = [
    ["WORKSPACE_NAME_MAX_LENGTH", env.WORKSPACE_NAME_MAX_LENGTH, DB_MAX_NAME_LENGTH],
    ["BRAND_NAME_MAX_LENGTH", env.BRAND_NAME_MAX_LENGTH, DB_MAX_NAME_LENGTH],
    ["BRAND_SETTINGS_MAX_BYTES", env.BRAND_SETTINGS_MAX_BYTES, DB_MAX_JSON_BYTES],
    ["REVIEW_NOTE_MAX_LENGTH", env.REVIEW_NOTE_MAX_LENGTH, DB_MAX_NOTE_LENGTH],
  ];
  for (const [variable, value, ceiling] of ceilings) {
    if (value > ceiling) {
      issues.push({ variable, problem: `must not exceed the database limit of ${ceiling}` });
    }
  }
  if (issues.length > 0) return { ok: false, issues };

  const secretValues = SECRET_VARIABLES.map((name) => env[name]).filter(
    (value): value is string => value !== undefined,
  );

  return {
    ok: true,
    config: {
      app: { name: env.APP_NAME, env: env.APP_ENV, url: env.APP_URL },
      log: { level: env.LOG_LEVEL },
      readiness: { timeoutMs: env.READINESS_TIMEOUT_MS },
      supabase: {
        url: env.NEXT_PUBLIC_SUPABASE_URL,
        publishableKey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        ...(env.SUPABASE_SECRET_KEY ? { secretKey: env.SUPABASE_SECRET_KEY } : {}),
      },
      llm: { enabled: env.LLM_ENABLED },
      research: { enabled: env.RESEARCH_ENABLED },
      notifications: { emailEnabled: env.NOTIFICATION_EMAIL_ENABLED },
      ownerMfaRequired: env.OWNER_MFA_REQUIRED,
      limits: {
        workspaceNameMaxLength: env.WORKSPACE_NAME_MAX_LENGTH,
        brandNameMaxLength: env.BRAND_NAME_MAX_LENGTH,
        brandSettingsMaxBytes: env.BRAND_SETTINGS_MAX_BYTES,
        maxBrandsPerWorkspace: env.MAX_BRANDS_PER_WORKSPACE,
        reviewNoteMaxLength: env.REVIEW_NOTE_MAX_LENGTH,
        maxRequestBodyBytes: env.MAX_REQUEST_BODY_BYTES,
        listPageSize: env.LIST_PAGE_SIZE,
      },
      env,
      secretValues,
    },
  };
}

/** Formats issues as one actionable line each, e.g. "APP_URL: is required". */
export function describeIssues(issues: readonly ConfigIssue[]): string[] {
  return issues.map((issue) => `${issue.variable}: ${issue.problem}`);
}

/**
 * Like parseConfig but throws a safe CONFIG_INVALID error.
 *
 * @throws AppError with variable names and problems only.
 */
export function loadConfig(source: EnvSource): AppConfig {
  const result = parseConfig(source);
  if (result.ok) return result.config;
  throw new AppError(
    "CONFIG_INVALID",
    "Server configuration is invalid. See .env.example and run `npm run check:config`.",
    { issues: describeIssues(result.issues) },
  );
}
