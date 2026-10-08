import type { LogFields, Logger } from "@/application/ports/logger";
import { isAppError } from "@/domain/errors/app-error";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
export const REDACTED = "[REDACTED]";
const TRUNCATED = "[TRUNCATED]";
const MAX_DEPTH = 5;
const MIN_SECRET_LENGTH = 6;
/** Field names that may carry credentials or private user/AI content. */
const SENSITIVE_KEY =
  /secret|token|password|passwd|authorization|cookie|api[-_]?key|credential|private|session|prompt|content|messages?$|body|payload/i;

export interface LoggerOptions {
  level: LogLevel;
  /** Known secret values scrubbed from any string, even under innocuous field names. */
  secrets?: readonly string[];
  /** Output sink, one JSON line per call. Defaults to the console. */
  write?: (line: string, level: LogLevel) => void;
  now?: () => Date;
  bindings?: LogFields;
}

function defaultWrite(line: string, level: LogLevel): void {
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

function scrubString(value: string, secrets: readonly string[]): string {
  let result = value;
  for (const secret of secrets) {
    if (secret.length >= MIN_SECRET_LENGTH) result = result.split(secret).join(REDACTED);
  }
  return result;
}

function sanitize(value: unknown, secrets: readonly string[], depth: number): unknown {
  if (typeof value === "string") return scrubString(value, secrets);
  if (value === null || typeof value !== "object") {
    return typeof value === "function" || typeof value === "symbol" ? undefined : value;
  }
  if (depth >= MAX_DEPTH) return TRUNCATED;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    // Messages from unknown errors may embed provider payloads; only AppError text is vetted.
    return isAppError(value)
      ? { name: value.name, code: value.code, message: scrubString(value.message, secrets) }
      : { name: value.name };
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, secrets, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(inner, secrets, depth + 1);
  }
  return out;
}

/**
 * Creates a JSON-lines logger that redacts sensitive field names and known secret values.
 *
 * @param options Level, secret values to scrub, and optional sink/clock for tests.
 */
export function createLogger(options: LoggerOptions): Logger {
  const secrets = options.secrets ?? [];
  const write = options.write ?? defaultWrite;
  const now = options.now ?? (() => new Date());
  const bindings = options.bindings ?? {};

  function emit(level: LogLevel, message: string, fields?: LogFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[options.level]) return;
    const entry = {
      time: now().toISOString(),
      level,
      message: scrubString(message, secrets),
      ...(sanitize({ ...bindings, ...fields }, secrets, 0) as Record<string, unknown>),
    };
    write(JSON.stringify(entry), level);
  }

  return {
    debug: (message, fields) => emit("debug", message, fields),
    info: (message, fields) => emit("info", message, fields),
    warn: (message, fields) => emit("warn", message, fields),
    error: (message, fields) => emit("error", message, fields),
    child: (fields) => createLogger({ ...options, bindings: { ...bindings, ...fields } }),
  };
}
