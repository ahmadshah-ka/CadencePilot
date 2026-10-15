import { z } from "zod";
import { AppError } from "@/domain/errors/app-error";
export const PREFERENCE_FIELDS = [
  "topic",
  "audience",
  "tone",
  "platforms",
  "targets.videos",
  "targets.shorts",
  "targets.posts",
  "timezone",
  "availability",
] as const;
export const preferenceProposalSchema = z
  .object({ field: z.enum(PREFERENCE_FIELDS), value: z.string().min(1).max(4000) })
  .strict();
export const memoryProposalSchema = z
  .object({
    scope: z.enum(["personal", "brand"]),
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_-]*$/)
      .max(64),
    value: z.string().trim().min(1).max(2000),
  })
  .strict();
/** Assistant output references authoritative numeric values instead of inventing literal totals. */
export function renderVerifiedAnswer(
  text: string,
  facts: Readonly<Record<string, string>>,
  maximum: number,
): string {
  if (!text.trim() || text.length > maximum)
    throw new AppError("DEPENDENCY_UNAVAILABLE", "The assistant response was incomplete.");
  const stripped = text.replace(/\[stat:([a-z_]+)\]/g, (_all, key: string) => {
    if (!Object.hasOwn(facts, key))
      throw new AppError(
        "DEPENDENCY_UNAVAILABLE",
        "The assistant used an unknown record reference.",
      );
    return "";
  });
  if (/\d/u.test(stripped) || stripped.includes("[stat:"))
    throw new AppError(
      "DEPENDENCY_UNAVAILABLE",
      "The assistant could not verify a numerical claim. Your records are unchanged.",
    );
  return text.replace(/\[stat:([a-z_]+)\]/g, (_all, key: string) => facts[key]!);
}
/** Never show a raw model numeral or an unfinished reference while a response is provisional. */
export function provisionalAnswer(text: string, facts: Readonly<Record<string, string>>): string {
  return text
    .replace(/\d/g, "·")
    .replace(/\[stat:([a-z_]+)\]/g, (_all, key: string) =>
      Object.hasOwn(facts, key) ? facts[key]! : "[unverified]",
    )
    .replace(/\[stat:[^\]]*$/, "…");
}
/** Missing questionnaire fields are deterministic; an explicitly configured zero target is present. */
export function missingPreferences(
  brand: Record<string, unknown>,
  personal: Record<string, unknown>,
): string[] {
  const missing: string[] = [];
  for (const key of ["topic", "audience", "tone"]) if (!brand[key]) missing.push(key);
  if (!Array.isArray(brand.platforms) || brand.platforms.length === 0) missing.push("platforms");
  const targets = (brand.targets ?? {}) as Record<string, unknown>;
  for (const key of ["videos", "shorts", "posts"])
    if (targets[key] === undefined) missing.push(`targets.${key}`);
  if (!personal.timezone) missing.push("timezone");
  if (!Array.isArray(personal.availability))
    missing.push("availability (an empty schedule is allowed)");
  return missing;
}
