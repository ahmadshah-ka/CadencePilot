import "server-only";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { AiDeps } from "@/application/ai/run-ai";
import type { Container } from "@/infrastructure/composition";
import { AppError } from "@/domain/errors/app-error";
import { aiRegistry as registry } from "@/config/ai-policy";
import { createGroqProvider } from "./groq-provider";
import { createSupabaseAiBudget } from "@/infrastructure/supabase/supabase-ai-budget";
/** Fail closed when AI is disabled/misconfigured; creates no paid fallback and starts no background work. */
export function createAiDeps(container: Container): AiDeps {
  if (!container.config.ok || !container.config.config.llm.enabled)
    throw new AppError("DEPENDENCY_UNAVAILABLE", "AI is disabled or unavailable.");
  const config = container.config.config,
    e = config.env;
  const model = registry.models[e.LLM_MODEL as keyof typeof registry.models];
  return {
    provider: createGroqProvider({
      baseUrl: e.LLM_BASE_URL,
      apiKey: e.LLM_API_KEY!,
      model: e.LLM_MODEL,
      capabilities: model!,
      maxResponseBytes: registry.maxResponseBytes,
      temperature: e.LLM_TEMPERATURE,
    }),
    budget: createSupabaseAiBudget({
      ...config.supabase,
      secureCookies: config.app.env !== "development",
    }),
    workspaces: container.workspaces,
    logger: container.logger,
    now: () => container.clock.now().getTime(),
    newId: randomUUID,
    sleep: async (ms, signal) => {
      await delay(ms, undefined, { signal });
    },
    policy: {
      enabled: true,
      timeoutMs: e.LLM_TIMEOUT_MS,
      maxRetries: e.LLM_MAX_RETRIES,
      contextTokens: e.LLM_CONTEXT_TOKEN_BUDGET,
      outputTokens: e.LLM_MAX_OUTPUT_TOKENS,
      overheadTokens: registry.inputOverheadTokens,
      maxTools: registry.maxTools,
      maxToolCalls: Math.min(registry.maxToolCalls, e.LLM_MAX_TOOL_STEPS),
      maxMessages: registry.maxMessages,
      retryDelayMs: registry.retryDelayMs,
      maxRetryDelayMs: registry.maxRetryDelayMs,
      inputCostPerMillion: e.LLM_INPUT_COST_PER_MILLION,
      outputCostPerMillion: e.LLM_OUTPUT_COST_PER_MILLION,
      caps: {
        globalDailyTokens: e.LLM_GLOBAL_DAILY_TOKEN_CAP!,
        workspaceDailyTokens: e.LLM_WORKSPACE_DAILY_TOKEN_CAP!,
        globalDailyRequests: e.LLM_GLOBAL_DAILY_REQUEST_CAP,
        workspaceDailyRequests: e.LLM_WORKSPACE_DAILY_REQUEST_CAP,
        tokensPerMinute: e.LLM_GLOBAL_TOKENS_PER_MINUTE!,
        requestsPerMinute: e.LLM_GLOBAL_REQUESTS_PER_MINUTE!,
        workspaceRequestsPerMinute: e.LLM_WORKSPACE_REQUESTS_PER_MINUTE,
      },
    },
  };
}
