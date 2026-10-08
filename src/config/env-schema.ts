import { z } from "zod";

/** Stable protocol identifiers (not tenant or environment settings). */
export const APP_ENVIRONMENTS = ["development", "staging", "production"] as const;
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
/** Default readiness probe timeout; also used when configuration itself failed to load. */
export const DEFAULT_READINESS_TIMEOUT_MS = 2000;

const requiredText = z.string({ error: "is required" }).min(1, "is required");
const optionalText = z.string().optional();
const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);
const optionalPositiveInt = z.coerce.number().int().positive().optional();
const flag = (fallback: boolean) =>
  z
    .enum(["true", "false"], { error: 'must be "true" or "false"' })
    .default(fallback ? "true" : "false")
    .transform((value) => value === "true");
const httpUrl = (label: string) =>
  z
    .url({ protocol: /^https?$/, error: `${label} must be an http(s) URL` })
    .transform((value) => value.replace(/\/+$/, ""));
const requiredHttpUrl = (label: string) => z.string({ error: "is required" }).pipe(httpUrl(label));

/**
 * Raw environment variables as documented in .env.example. Variables for features that are not
 * built yet are accepted and typed, but only the core group is required to start.
 */
export const envSchema = z.object({
  APP_NAME: requiredText,
  APP_ENV: z
    .enum(APP_ENVIRONMENTS, { error: "must be development, staging or production" })
    .default("development"),
  APP_URL: requiredHttpUrl("APP_URL"),
  LOG_LEVEL: z.enum(LOG_LEVELS, { error: "must be debug, info, warn or error" }).default("info"),
  READINESS_TIMEOUT_MS: positiveInt(DEFAULT_READINESS_TIMEOUT_MS),

  NEXT_PUBLIC_SUPABASE_URL: requiredHttpUrl("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: requiredText,
  SUPABASE_SECRET_KEY: optionalText,
  DATABASE_URL: optionalText,
  AUTH_PROVIDER: z.enum(["supabase"]).default("supabase"),

  QUEUE_PROVIDER: z.enum(["supabase"]).default("supabase"),
  QUEUE_NAME: optionalText,
  WORKER_SHARED_SECRET: optionalText,
  WORKER_BATCH_SIZE: positiveInt(1),
  JOB_MAX_ATTEMPTS: positiveInt(3),
  JOB_LEASE_SECONDS: positiveInt(120),
  JOB_RECOVERY_INTERVAL_SECONDS: positiveInt(60),

  LLM_ENABLED: flag(false),
  LLM_PROVIDER: z.enum(["groq"]).default("groq"),
  LLM_MODEL: z.string().min(1).default("openai/gpt-oss-120b"),
  LLM_API_KEY: optionalText,
  LLM_BASE_URL: httpUrl("LLM_BASE_URL").optional(),
  LLM_TIMEOUT_MS: positiveInt(30000),
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).default(2),
  LLM_CONTEXT_TOKEN_BUDGET: positiveInt(3000),
  LLM_MAX_OUTPUT_TOKENS: positiveInt(1500),
  LLM_MAX_TOOL_STEPS: positiveInt(4),
  LLM_GLOBAL_DAILY_TOKEN_CAP: optionalPositiveInt,
  LLM_WORKSPACE_DAILY_TOKEN_CAP: optionalPositiveInt,
  LLM_GLOBAL_TOKENS_PER_MINUTE: optionalPositiveInt,
  LLM_GLOBAL_REQUESTS_PER_MINUTE: optionalPositiveInt,

  RESEARCH_ENABLED: flag(false),
  RESEARCH_PROVIDER: z.enum(["tavily"]).default("tavily"),
  RESEARCH_API_KEY: optionalText,
  RESEARCH_BASE_URL: httpUrl("RESEARCH_BASE_URL").optional(),
  RESEARCH_MAX_SEARCHES_PER_RUN: positiveInt(3),
  RESEARCH_MAX_SOURCES_PER_RUN: positiveInt(6),
  RESEARCH_MAX_DEPTH: positiveInt(2),
  RESEARCH_TIMEOUT_MS: positiveInt(30000),
  RESEARCH_GLOBAL_MONTHLY_CREDIT_CAP: optionalPositiveInt,
  RESEARCH_WORKSPACE_MONTHLY_CREDIT_CAP: optionalPositiveInt,

  NOTIFICATION_EMAIL_ENABLED: flag(false),
  EMAIL_PROVIDER: z.enum(["resend"]).default("resend"),
  EMAIL_API_KEY: optionalText,
  EMAIL_FROM: z.email().optional(),

  LIST_PAGE_SIZE: positiveInt(25),
  CALENDAR_MAX_RANGE_DAYS: positiveInt(42),
  AI_RETENTION_DAYS: optionalPositiveInt,
  OWNER_MFA_REQUIRED: flag(true),
});

export type RawEnv = z.infer<typeof envSchema>;

/** Variables that must be present when a flagged optional service is switched on. */
export const ENABLED_SERVICE_REQUIREMENTS = [
  {
    flag: "LLM_ENABLED",
    required: [
      "LLM_API_KEY",
      "LLM_GLOBAL_DAILY_TOKEN_CAP",
      "LLM_WORKSPACE_DAILY_TOKEN_CAP",
      "LLM_GLOBAL_TOKENS_PER_MINUTE",
      "LLM_GLOBAL_REQUESTS_PER_MINUTE",
    ],
  },
  {
    flag: "RESEARCH_ENABLED",
    required: [
      "RESEARCH_API_KEY",
      "RESEARCH_GLOBAL_MONTHLY_CREDIT_CAP",
      "RESEARCH_WORKSPACE_MONTHLY_CREDIT_CAP",
    ],
  },
  { flag: "NOTIFICATION_EMAIL_ENABLED", required: ["EMAIL_API_KEY", "EMAIL_FROM"] },
] as const satisfies ReadonlyArray<{ flag: keyof RawEnv; required: ReadonlyArray<keyof RawEnv> }>;

/** Variables whose values are secrets and must never be logged or sent to the browser. */
export const SECRET_VARIABLES = [
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "WORKER_SHARED_SECRET",
  "LLM_API_KEY",
  "RESEARCH_API_KEY",
  "EMAIL_API_KEY",
] as const satisfies ReadonlyArray<keyof RawEnv>;
