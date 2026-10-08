import { AppError } from "@/domain/errors/app-error";

interface DbError {
  message?: string;
  code?: string;
}

/**
 * Maps database error markers raised by our own functions to safe application errors. Anything
 * unrecognised becomes DEPENDENCY_UNAVAILABLE so raw driver text never reaches callers.
 */
export function mapDatabaseError(error: DbError): AppError {
  const message = error.message ?? "";
  if (message.includes("stale_revision")) {
    return new AppError("CONFLICT", "The record changed. Reload and try again.", {
      reason: "stale_revision",
    });
  }
  if (message.includes("invalid_transition")) {
    return new AppError("CONFLICT", "That change is not allowed for the current status.", {
      reason: "invalid_transition",
    });
  }
  if (message.includes("not_found") || error.code === "P0002") {
    return new AppError("NOT_FOUND", "Not found.");
  }
  if (
    message.includes("self_review_not_allowed") ||
    message.includes("forbidden") ||
    error.code === "42501"
  ) {
    return new AppError("FORBIDDEN", "You do not have access.");
  }
  if (
    message.includes("invalid_decision") ||
    message.includes("invalid_name") ||
    error.code === "22023"
  ) {
    return new AppError("INVALID_REQUEST", "The request is not valid.");
  }
  if (error.code === "23505") {
    return new AppError("CONFLICT", "That name is already in use.", { reason: "duplicate" });
  }
  return new AppError("DEPENDENCY_UNAVAILABLE", "The service is temporarily unavailable.");
}
