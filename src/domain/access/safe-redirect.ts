/** Paths a signed-in user may be sent back to after authentication. */
export const ALLOWED_REDIRECT_PREFIXES = ["/app", "/admin"] as const;
export const DEFAULT_REDIRECT_PATH = "/app";

const PLACEHOLDER_ORIGIN = "http://placeholder.invalid";
const CONTROL_OR_BACKSLASH = /[\u0000-\u001f\u007f\\]/;

/**
 * Returns a same-site relative path that is safe to redirect to, or the default. Rejects absolute
 * URLs, protocol-relative URLs, backslashes, control characters and paths outside the allow list.
 */
export function sanitizeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || CONTROL_OR_BACKSLASH.test(raw)) {
    return DEFAULT_REDIRECT_PATH;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
  if (parsed.origin !== PLACEHOLDER_ORIGIN) return DEFAULT_REDIRECT_PATH;
  const allowed = ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`),
  );
  return allowed ? `${parsed.pathname}${parsed.search}` : DEFAULT_REDIRECT_PATH;
}
