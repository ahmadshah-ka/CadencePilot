import { z } from "zod";
import raw from "./content-policy.json";
// Database schema ceilings, not per-user settings; changing them requires a migration.
const DB_TITLE_MAX = 500,
  DB_TEXT_MAX = 100000,
  DB_URL_MAX = 4096,
  DB_PAGE_MAX = 100;
/** Validate versioned non-secret configuration when the module is loaded. */
export const contentPolicy = z
  .object({
    titleMaxLength: z.number().int().positive().max(DB_TITLE_MAX),
    transcriptMaxLength: z.number().int().positive().max(DB_TEXT_MAX),
    notesMaxLength: z.number().int().positive().max(DB_TEXT_MAX),
    urlMaxLength: z.number().int().positive().max(DB_URL_MAX),
    listPageSize: z.number().int().positive().max(DB_PAGE_MAX),
  })
  .strict()
  .parse(raw);
