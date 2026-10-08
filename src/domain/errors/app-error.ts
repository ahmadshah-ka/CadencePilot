/** Stable machine-readable error codes shared by every API response. */
export const ERROR_CODES = [
  "INVALID_REQUEST",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "RATE_LIMITED",
  "CONFIG_INVALID",
  "DEPENDENCY_UNAVAILABLE",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Error whose message and details are safe to show to a caller. Never place secrets, user
 * content or raw provider payloads in either.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/**
 * Structural AppError check. `instanceof` is unreliable here: Next.js can load this module once
 * per bundle (routes, server actions, instrumentation), so an error thrown by a shared adapter may
 * come from a different copy of the class.
 */
export function isAppError(error: unknown): error is AppError {
  if (error instanceof AppError) return true;
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { name?: unknown; code?: unknown; message?: unknown };
  return (
    candidate.name === "AppError" &&
    typeof candidate.code === "string" &&
    (ERROR_CODES as readonly string[]).includes(candidate.code) &&
    typeof candidate.message === "string"
  );
}

/** The uniform API error envelope. */
export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; details?: Readonly<Record<string, unknown>> };
}

/** Converts any thrown value into a safe envelope; unknown errors become a generic INTERNAL. */
export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if (isAppError(error)) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
  return { error: { code: "INTERNAL", message: "An unexpected error occurred." } };
}
