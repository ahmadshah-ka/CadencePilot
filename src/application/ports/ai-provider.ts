import type { z } from "zod";
export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
export interface AiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  validate: z.ZodType;
}
export interface AiOutput {
  name: string;
  schema: Record<string, unknown>;
  validate: z.ZodType;
}
export interface AiCapabilities {
  streaming: boolean;
  tools: boolean;
  structured: boolean;
  contextTokens: number;
}
export interface AiRequest {
  messages: AiMessage[];
  maxOutputTokens: number;
  stream: boolean;
  tools: AiTool[];
  output?: AiOutput;
  signal: AbortSignal;
}
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}
export interface AiResult {
  text: string;
  toolCalls: { id: string; name: string; arguments: unknown }[];
  usage: AiUsage | null;
  finishReason: string;
}
/** No adapter executes tools. Deltas are provisional plain text until the final result validates. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: AiCapabilities;
  generate(request: AiRequest, onText?: (text: string) => Promise<void>): Promise<AiResult>;
}
/** Safe normalized failure; never attach provider bodies, prompts or credentials. */
export class AiProviderError extends Error {
  constructor(
    readonly kind: "rate_limit" | "rejected" | "unavailable" | "invalid_output",
    readonly charged: "zero" | "unknown",
    readonly retryAfterMs: number | null = null,
  ) {
    super("AI provider request did not complete.");
    this.name = "AiProviderError";
  }
}
