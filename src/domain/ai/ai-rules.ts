import { AppError } from "@/domain/errors/app-error";
interface AiCapabilities {
  streaming: boolean;
  tools: boolean;
  structured: boolean;
  contextTokens: number;
}
interface AiMessage {
  role: string;
  content: string;
}
interface AiTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
interface AiOutput {
  schema: Record<string, unknown>;
}
/** UTF-8 byte count is a conservative token bound for the supported byte-fallback tokenizers.
 * Include serialized schemas and a configurable chat-template overhead; never silently truncate. */
export function inputTokenBound(
  messages: AiMessage[],
  tools: AiTool[],
  output: AiOutput | undefined,
  overhead: number,
): number {
  return (
    new TextEncoder().encode(
      JSON.stringify({
        messages,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        output: output?.schema,
      }),
    ).length + overhead
  );
}
/** Reject unsupported combinations before reserving budget or contacting a provider. */
export function assertAiCapabilities(
  c: AiCapabilities,
  stream: boolean,
  tools: AiTool[],
  output: AiOutput | undefined,
): void {
  if (
    (stream && !c.streaming) ||
    (tools.length > 0 && !c.tools) ||
    (output && !c.structured) ||
    (output && (stream || tools.length > 0))
  )
    throw new AppError(
      "INVALID_REQUEST",
      "This model does not support the requested AI phase. Separate tool, streaming and structured-output phases.",
    );
}
