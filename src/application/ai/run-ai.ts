import { z } from "zod";
import { authorizeWorkspace } from "@/application/workspaces/workspace-use-cases";
import type { WorkspaceRepository } from "@/application/ports/workspace-repository";
import type { Principal } from "@/domain/access/access-policy";
import type {
  AiProvider,
  AiMessage,
  AiTool,
  AiOutput,
  AiResult,
  AiUsage,
} from "@/application/ports/ai-provider";
import { AiProviderError } from "@/application/ports/ai-provider";
import type { AiBudget, AiCaps } from "@/application/ports/ai-budget";
import type { Logger } from "@/application/ports/logger";
import { inputTokenBound, assertAiCapabilities } from "@/domain/ai/ai-rules";
import { AppError } from "@/domain/errors/app-error";
export interface AiPolicy {
  enabled: boolean;
  timeoutMs: number;
  maxRetries: number;
  contextTokens: number;
  outputTokens: number;
  overheadTokens: number;
  maxTools: number;
  maxToolCalls: number;
  maxMessages: number;
  retryDelayMs: number;
  maxRetryDelayMs: number;
  inputCostPerMillion?: number;
  outputCostPerMillion?: number;
  caps: AiCaps;
}
export interface AiDeps {
  provider: AiProvider;
  budget: AiBudget;
  workspaces: WorkspaceRepository;
  logger: Logger;
  policy: AiPolicy;
  now: () => number;
  newId: () => string;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
}
export interface AiCall {
  workspaceId: string;
  brandId: string;
  traceId: string;
  requestId: string;
  promptVersion: string;
  messages: AiMessage[];
  tools?: AiTool[];
  output?: AiOutput;
  stream?: boolean;
  signal?: AbortSignal;
}
const scopeSchema = z.object({
  workspaceId: z.uuid(),
  brandId: z.uuid(),
  traceId: z.uuid(),
  requestId: z.uuid(),
  promptVersion: z.string().regex(/^[a-z0-9-]+-v[1-9][0-9]*$/),
});
const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});
function estimateCost(p: AiPolicy, u: AiUsage | null): number | null {
  const MILLION = 1000000;
  return u && p.inputCostPerMillion !== undefined && p.outputCostPerMillion !== undefined
    ? (u.inputTokens * p.inputCostPerMillion + u.outputTokens * p.outputCostPerMillion) / MILLION
    : null;
}
/** Approved membership and live brand checks precede every paid attempt, including retries. */
async function authorize(deps: AiDeps, p: Principal | null, call: AiCall) {
  await authorizeWorkspace({ workspaces: deps.workspaces }, p, call.workspaceId);
  const brand = await deps.workspaces.getBrand(call.workspaceId, call.brandId);
  if (!brand || brand.workspaceId !== call.workspaceId)
    throw new AppError("NOT_FOUND", "Not found.");
  if (brand.archivedAt) throw new AppError("CONFLICT", "Restore this brand before using AI.");
}
/** Executes one bounded model phase. No model-supplied tool is executed or business data written.
 * Every retry gets a new durable reservation. Unknown usage remains fully reserved, even on cancellation. */
export async function runAi(
  deps: AiDeps,
  principal: Principal | null,
  call: AiCall,
  onText?: (text: string) => Promise<void>,
): Promise<AiResult & { data?: unknown }> {
  const p = deps.policy,
    tools = call.tools ?? [],
    stream = call.stream ?? false;
  if (!scopeSchema.safeParse(call).success)
    throw new AppError("INVALID_REQUEST", "Invalid AI scope.");
  await authorize(deps, principal, call);
  if (!p.enabled) throw new AppError("DEPENDENCY_UNAVAILABLE", "AI is disabled.");
  if (
    !z
      .array(
        z
          .object({ role: z.enum(["system", "user", "assistant"]), content: z.string().min(1) })
          .strict(),
      )
      .min(1)
      .max(p.maxMessages)
      .safeParse(call.messages).success ||
    tools.length > p.maxTools ||
    new Set(tools.map((t) => t.name)).size !== tools.length
  )
    throw new AppError("INVALID_REQUEST", "Invalid AI input.");
  assertAiCapabilities(deps.provider.capabilities, stream, tools, call.output);
  const inputTokens = inputTokenBound(call.messages, tools, call.output, p.overheadTokens),
    tokens = inputTokens + p.outputTokens;
  if (inputTokens > p.contextTokens || tokens > deps.provider.capabilities.contextTokens)
    throw new AppError("INVALID_REQUEST", "AI context is too large. Reduce the supplied context.");
  const signal = call.signal ?? new AbortController().signal;
  for (let attempt = 0; attempt <= p.maxRetries; attempt++) {
    signal.throwIfAborted();
    await authorize(deps, principal, call);
    const id = attempt === 0 ? call.requestId : deps.newId(),
      started = deps.now();
    const admitted = await deps.budget.reserve(
      {
        id,
        tokens,
        workspaceId: call.workspaceId,
        brandId: call.brandId,
        userId: principal!.userId,
        traceId: call.traceId,
        provider: deps.provider.name,
        model: deps.provider.model,
        promptVersion: call.promptVersion,
      },
      p.caps,
    );
    if (!admitted)
      throw new AppError(
        "RATE_LIMITED",
        "AI budget is exhausted. Try again after the budget window resets.",
      );
    let usage: AiUsage | null = null,
      emitted = false,
      result: AiResult | undefined,
      problem: unknown;
    try {
      const timeout = AbortSignal.timeout(p.timeoutMs),
        bounded = AbortSignal.any([signal, timeout]);
      bounded.throwIfAborted();
      result = await deps.provider.generate(
        {
          messages: call.messages,
          tools,
          output: call.output,
          maxOutputTokens: p.outputTokens,
          stream,
          signal: bounded,
        },
        async (text) => {
          emitted = true;
          await onText?.(text);
        },
      );
      if (result.usage && !usageSchema.safeParse(result.usage).success)
        throw new AiProviderError("invalid_output", "unknown");
      usage = result.usage;
      if (
        (!result.text.trim() && result.toolCalls.length === 0) ||
        (result.finishReason === "tool_calls" && result.toolCalls.length === 0)
      )
        throw new AiProviderError("invalid_output", "unknown");
      if (result.finishReason !== "stop" && result.finishReason !== "tool_calls")
        throw new AiProviderError("invalid_output", "unknown");
      if (result.toolCalls.length > p.maxToolCalls || (!tools.length && result.toolCalls.length))
        throw new AiProviderError("invalid_output", "unknown");
      for (const toolCall of result.toolCalls) {
        const tool = tools.find((t) => t.name === toolCall.name);
        const parsed = tool?.validate.safeParse(toolCall.arguments);
        if (!parsed?.success) throw new AiProviderError("invalid_output", "unknown");
        toolCall.arguments = parsed.data;
      }
      if (call.output) {
        let json: unknown;
        try {
          json = JSON.parse(result.text);
        } catch {
          throw new AiProviderError("invalid_output", "unknown");
        }
        const parsed = call.output.validate.safeParse(json);
        if (!parsed.success) throw new AiProviderError("invalid_output", "unknown");
        Object.assign(result, { data: parsed.data });
      }
    } catch (error) {
      problem = error;
    }
    const knownZero = problem instanceof AiProviderError && problem.charged === "zero";
    const settledUsage = usage ?? (knownZero ? { inputTokens: 0, outputTokens: 0 } : null);
    const status = settledUsage ? (problem ? "failed" : "success") : "unknown";
    // A failed settlement must stop execution; its original reservation remains charged.
    await deps.budget.settle({
      id,
      usage: settledUsage,
      status,
      latencyMs: Math.max(0, deps.now() - started),
      estimatedCost: estimateCost(p, settledUsage),
    });
    deps.logger.info("ai attempt", {
      traceId: call.traceId,
      reservationId: id,
      provider: deps.provider.name,
      model: deps.provider.model,
      promptVersion: call.promptVersion,
      status,
      inputTokens: settledUsage?.inputTokens ?? null,
      outputTokens: settledUsage?.outputTokens ?? null,
      latencyMs: Math.max(0, deps.now() - started),
      estimatedCost: estimateCost(p, settledUsage),
    });
    if (settledUsage && settledUsage.inputTokens + settledUsage.outputTokens > tokens) {
      deps.logger.warn("ai usage exceeded reservation", {
        traceId: call.traceId,
        reservationId: id,
        reservedTokens: tokens,
        actualTokens: settledUsage.inputTokens + settledUsage.outputTokens,
      });
    }
    if (!problem) return result!;
    const retry =
      problem instanceof AiProviderError &&
      problem.kind === "rate_limit" &&
      !emitted &&
      !signal.aborted;
    const delay =
      problem instanceof AiProviderError
        ? (problem.retryAfterMs ?? p.retryDelayMs)
        : p.retryDelayMs;
    if (retry && attempt < p.maxRetries && delay <= p.maxRetryDelayMs) {
      await deps.sleep(delay, signal);
      continue;
    }
    if (retry) throw new AppError("RATE_LIMITED", "AI provider is rate limited. Try again later.");
    throw new AppError(
      "DEPENDENCY_UNAVAILABLE",
      "AI did not complete. Your existing work is unchanged.",
    );
  }
  throw new AppError("DEPENDENCY_UNAVAILABLE", "AI unavailable.");
}
