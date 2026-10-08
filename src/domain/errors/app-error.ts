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

/** The uniform API error envelope. */
export interface ErrorEnvelope {
  error: { code: ErrorCode; message: string; details?: Readonly<Record<string, unknown>> };
}

/** Converts any thrown value into a safe envelope; unknown errors become a generic INTERNAL. */
export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof AppError) {
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
