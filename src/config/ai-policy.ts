import { z } from "zod";
import raw from "./ai-capabilities.json";
const positive = z.number().int().positive();
const schema = z
  .object({
    provider: z.literal("groq"),
    baseUrl: z.url({ protocol: /^https$/ }),
    models: z.record(
      z.string(),
      z
        .object({
          streaming: z.boolean(),
          tools: z.boolean(),
          structured: z.boolean(),
          contextTokens: positive,
        })
        .strict(),
    ),
    inputOverheadTokens: positive,
    maxResponseBytes: positive,
    maxTools: positive,
    maxToolCalls: positive,
    maxMessages: positive,
    retryDelayMs: positive,
    maxRetryDelayMs: positive,
  })
  .strict();
/** Versioned, nonsecret operator settings validate once before constructing AI services. */
export const aiRegistry = schema.parse(raw);
