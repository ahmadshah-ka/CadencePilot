import type { ZodType } from "zod";
import { AppError } from "@/domain/errors/app-error";

/**
 * Reads and validates a JSON request body with a size limit.
 *
 * @throws AppError INVALID_REQUEST for a wrong content type, oversize, malformed or invalid body.
 *   Only field paths and generic messages are returned, never the submitted values.
 */
export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
  maxBytes: number,
): Promise<T> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError("INVALID_REQUEST", "Content-Type must be application/json.");
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new AppError("INVALID_REQUEST", "The request body is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).length > maxBytes) {
    throw new AppError("INVALID_REQUEST", "The request body is too large.");
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError("INVALID_REQUEST", "The request body is not valid JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new AppError("INVALID_REQUEST", "The request body is not valid.", {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}
