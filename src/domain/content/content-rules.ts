import { z } from "zod";
export const CONTENT_FORMATS = ["video", "short", "post"] as const;
export const CONTENT_KINDS = ["original", "derivative"] as const;
export const PRODUCTION_STAGES = ["planned", "recorded", "edited", "ready"] as const;
export const TASK_STAGES = ["record", "edit", "ready"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];
export type TaskStage = (typeof TASK_STAGES)[number];
export interface ContentPolicy {
  titleMaxLength: number;
  transcriptMaxLength: number;
  notesMaxLength: number;
  urlMaxLength: number;
  listPageSize: number;
}
export const FORMAT_STAGES: Record<ContentFormat, readonly TaskStage[]> = {
  video: TASK_STAGES,
  short: TASK_STAGES,
  post: ["edit", "ready"],
};
const ALLOWED_PROTOCOLS = new Set(["https:", "http:"]);
/** External references are links only, never fetched or treated as executable content. */
export function isSafeExternalUrl(value: string): boolean {
  if (value === "") return true;
  if (/\s/.test(value)) return false;
  try {
    const u = new URL(value);
    return ALLOWED_PROTOCOLS.has(u.protocol) && !u.username && !u.password;
  } catch {
    return false;
  }
}
/** Validate UTC-offset timestamps against the injected clock; future publications are not actuals. */
export function isActualPublication(value: string | null, now: Date): boolean {
  return (
    value === null || (Number.isFinite(Date.parse(value)) && Date.parse(value) <= now.getTime())
  );
}
/** Typed contracts used at both application and HTTP boundaries. */
export function contentSchemas(policy: ContentPolicy, platforms: readonly string[]) {
  const title = z.string().trim().min(1).max(policy.titleMaxLength);
  const link = z
    .string()
    .trim()
    .max(policy.urlMaxLength)
    .refine(isSafeExternalUrl, "Use an http(s) URL without embedded credentials.");
  const create = z
    .object({
      requestId: z.uuid(),
      title,
      format: z.enum(CONTENT_FORMATS),
      parentId: z.uuid().nullable(),
      seriesId: z.uuid().nullable(),
    })
    .strict();
  const edit = z
    .object({
      expectedRevision: z.number().int().positive(),
      title,
      sourceUrl: link,
      sourceTranscript: z.string().max(policy.transcriptMaxLength),
      notes: z.string().max(policy.notesMaxLength),
    })
    .strict();
  const archive = z
    .object({ expectedRevision: z.number().int().positive(), archived: z.boolean() })
    .strict();
  const task = z
    .object({
      expectedRevision: z.number().int().positive(),
      stage: z.enum(TASK_STAGES),
      completed: z.boolean(),
    })
    .strict();
  const publication = z
    .object({
      expectedRevision: z.number().int().min(0),
      platform: z.string().refine((v) => platforms.includes(v), "Choose a supported platform."),
      publishedAt: z.iso.datetime({ offset: true }).nullable(),
      url: link,
    })
    .strict();
  const series = z.object({ requestId: z.uuid(), title }).strict();
  return { create, edit, archive, task, publication, series };
}
/** Production steps are format-specific; text content never requires recording. */
export function requiredStages(format: ContentFormat): readonly TaskStage[] {
  return FORMAT_STAGES[format];
}
