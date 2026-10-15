import "server-only";
import { z } from "zod";
import type {
  AiProvider,
  AiRequest,
  AiResult,
  AiUsage,
  AiCapabilities,
} from "@/application/ports/ai-provider";
import { AiProviderError } from "@/application/ports/ai-provider";
export interface GroqSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  capabilities: AiCapabilities;
  maxResponseBytes: number;
  temperature: number;
}
const COMPLETIONS_PATH = "/chat/completions";
const DONE = "[DONE]";
const MILLISECONDS_PER_SECOND = 1000;
const UNCHARGED_REJECTION_STATUSES = new Set([401, 403, 404]);
const usageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
});
const toolSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({ name: z.string(), arguments: z.string() }),
});
const completionSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
          tool_calls: z.array(toolSchema).optional(),
        }),
      }),
    )
    .length(1),
  usage: usageSchema.optional(),
});
const chunkSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullable().optional(),
      delta: z.object({
        content: z.string().nullable().optional(),
        tool_calls: z
          .array(
            z.object({
              index: z.number().int().nonnegative(),
              id: z.string().optional(),
              function: z
                .object({ name: z.string().optional(), arguments: z.string().optional() })
                .optional(),
            }),
          )
          .optional(),
      }),
    }),
  ),
  x_groq: z.object({ usage: usageSchema.optional() }).optional(),
  usage: usageSchema.nullable().optional(),
});
const invalid = () => new AiProviderError("invalid_output", "unknown");
function usage(value: z.infer<typeof usageSchema> | null | undefined): AiUsage | null {
  return value ? { inputTokens: value.prompt_tokens, outputTokens: value.completion_tokens } : null;
}
/** Retry-After seconds or HTTP date; invalid hints are ignored, valid hints are never shortened. */
export function retryAfterMs(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * MILLISECONDS_PER_SECOND);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
function argumentsOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw invalid();
  }
}
/** Bounded HTTP adapter. Uses only an operator-approved origin; redirects and arbitrary tool execution are forbidden. */
export function createGroqProvider(
  settings: GroqSettings,
  fetcher: typeof fetch = fetch,
): AiProvider {
  const base = new URL(settings.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw new Error("Invalid AI endpoint configuration.");
  return {
    name: "groq",
    model: settings.model,
    capabilities: settings.capabilities,
    async generate(request: AiRequest, onText): Promise<AiResult> {
      try {
        const response = await fetcher(settings.baseUrl.replace(/\/$/, "") + COMPLETIONS_PATH, {
          method: "POST",
          redirect: "error",
          signal: request.signal,
          headers: {
            authorization: `Bearer ${settings.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: settings.model,
            temperature: settings.temperature,
            messages: request.messages,
            max_completion_tokens: request.maxOutputTokens,
            stream: request.stream,
            ...(request.stream ? { stream_options: { include_usage: true } } : {}),
            ...(request.tools.length
              ? {
                  tools: request.tools.map((t) => ({
                    type: "function",
                    function: {
                      name: t.name,
                      description: t.description,
                      parameters: t.parameters,
                    },
                  })),
                  tool_choice: "auto",
                }
              : {}),
            ...(request.output
              ? {
                  response_format: {
                    type: "json_schema",
                    json_schema: {
                      name: request.output.name,
                      strict: true,
                      schema: request.output.schema,
                    },
                  },
                }
              : {}),
          }),
        });
        if (!response.ok) {
          await response.body?.cancel();
          if (response.status === 429)
            throw new AiProviderError(
              "rate_limit",
              "zero",
              retryAfterMs(response.headers.get("retry-after"), Date.now()),
            );
          if (response.status >= 400 && response.status < 500)
            throw new AiProviderError(
              "rejected",
              UNCHARGED_REJECTION_STATUSES.has(response.status) ? "zero" : "unknown",
            );
          throw new AiProviderError("unavailable", "unknown");
        }
        if (!response.body) throw invalid();
        const reader = response.body.getReader(),
          decoder = new TextDecoder();
        let bytes = 0;
        let text = "",
          finishReason = "",
          actual: AiUsage | null = null,
          done = false,
          buffer = "";
        const calls = new Map<number, { id: string; name: string; arguments: string }>();
        function consume(line: string) {
          if (!line.startsWith("data:")) return;
          const raw = line.slice("data:".length).trim();
          if (!raw) return;
          if (raw === DONE) {
            done = true;
            return;
          }
          if (done) throw invalid();
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            throw invalid();
          }
          const chunk = chunkSchema.safeParse(parsed);
          if (!chunk.success) throw invalid();
          actual = usage(chunk.data.x_groq?.usage ?? chunk.data.usage) ?? actual;
          for (const c of chunk.data.choices) {
            if (c.finish_reason) finishReason = c.finish_reason;
            if (c.delta.content) text += c.delta.content;
            for (const t of c.delta.tool_calls ?? []) {
              const old = calls.get(t.index) ?? { id: "", name: "", arguments: "" };
              old.id += t.id ?? "";
              old.name += t.function?.name ?? "";
              old.arguments += t.function?.arguments ?? "";
              calls.set(t.index, old);
            }
          }
        }
        try {
          while (true) {
            request.signal.throwIfAborted();
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.byteLength;
            if (bytes > settings.maxResponseBytes) throw invalid();
            const chunk = decoder.decode(next.value, { stream: true });
            if (!request.stream) {
              buffer += chunk;
              continue;
            }
            buffer += chunk;
            let end = buffer.indexOf("\n");
            while (end >= 0) {
              const before = text.length;
              consume(buffer.slice(0, end).replace(/\r$/, ""));
              buffer = buffer.slice(end + 1);
              if (text.length > before) await onText?.(text.slice(before));
              end = buffer.indexOf("\n");
            }
          }
          buffer += decoder.decode();
        } finally {
          // Cancellation after a completed/failed read is best-effort; preserve the original outcome.
          await reader.cancel().catch(() => undefined);
          reader.releaseLock();
        }
        if (!request.stream) {
          let raw: unknown;
          try {
            raw = JSON.parse(buffer);
          } catch {
            throw invalid();
          }
          const parsed = completionSchema.safeParse(raw);
          if (!parsed.success) throw invalid();
          const choice = parsed.data.choices[0]!;
          if (choice.message.refusal) throw invalid();
          return {
            text: choice.message.content ?? "",
            finishReason: choice.finish_reason,
            usage: usage(parsed.data.usage),
            toolCalls: (choice.message.tool_calls ?? []).map((t) => ({
              id: t.id,
              name: t.function.name,
              arguments: argumentsOf(t.function.arguments),
            })),
          };
        }
        if (buffer.trim()) consume(buffer.trim());
        if (!done || !finishReason) throw invalid();
        return {
          text,
          finishReason,
          usage: actual,
          toolCalls: [...calls.values()].map((t) => ({
            id: t.id,
            name: t.name,
            arguments: argumentsOf(t.arguments),
          })),
        };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        throw new AiProviderError("unavailable", "unknown");
      }
    },
  };
}
