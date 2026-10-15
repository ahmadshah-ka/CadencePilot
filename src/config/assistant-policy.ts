import { z } from "zod";
import raw from "./assistant-policy.json";
/** Server-owned bounds validate against hard database ceilings before use. */
export const assistantPolicy = z
  .object({
    turnsPerMinute: z.number().int().positive().max(60),
    turnsPerDay: z.number().int().positive().max(10000),
    messageMaxLength: z.number().int().positive().max(8000),
    answerMaxLength: z.number().int().positive().max(24000),
    memoryValueMaxLength: z.number().int().positive().max(2000),
    memoryKeyMaxLength: z.number().int().positive().max(64),
    pageSize: z.number().int().positive().max(100),
    historyLimit: z.number().int().positive().max(20),
    memoryLimit: z.number().int().positive().max(100),
    searchLimit: z.number().int().positive().max(20),
    searchQueryMaxLength: z.number().int().positive().max(1000),
    proposalLimit: z.number().int().positive().max(4),
    summaryExcerptLength: z.number().int().positive().max(500),
    summaryMaxLength: z.number().int().positive().max(4000),
    retentionDays: z.number().int().positive().max(3650),
    turnLeaseSeconds: z.number().int().min(10).max(600),
    streamBatchMs: z.number().int().min(100).max(5000),
    comparisonBrandLimit: z.number().int().positive().max(5),
  })
  .strict()
  .parse(raw);
export type AssistantPolicy = typeof assistantPolicy;
