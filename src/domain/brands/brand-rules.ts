/** Collapses whitespace and trims. Returns null if empty or longer than maxLength characters. */
export function normalizeDisplayName(raw: string, maxLength: number): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  if (name.length === 0 || [...name].length > maxLength) return null;
  return name;
}

/** Serialized UTF-8 size of a JSON value in bytes. */
export function jsonByteSize(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/** True for a non-array, non-null plain object. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
