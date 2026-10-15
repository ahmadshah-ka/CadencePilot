import "server-only";
import type { AiBudget } from "@/application/ports/ai-budget";
import { AppError } from "@/domain/errors/app-error";
import { createServiceClient, type SupabaseSettings } from "./clients";
const unavailable = () =>
  new AppError("DEPENDENCY_UNAVAILABLE", "AI budget storage is unavailable.");
/** Service role can call only fixed RPC names here; no caller-controlled tables, SQL or cap overrides. */
export function createSupabaseAiBudget(settings: SupabaseSettings): AiBudget {
  return {
    async reserve(r, c) {
      const { data, error } = await createServiceClient(settings).rpc("reserve_ai_budget", {
        p_id: r.id,
        p_workspace: r.workspaceId,
        p_brand: r.brandId,
        p_user: r.userId,
        p_trace: r.traceId,
        p_provider: r.provider,
        p_model: r.model,
        p_prompt: r.promptVersion,
        p_tokens: r.tokens,
        p_global_day_tokens: c.globalDailyTokens,
        p_workspace_day_tokens: c.workspaceDailyTokens,
        p_global_day_requests: c.globalDailyRequests,
        p_workspace_day_requests: c.workspaceDailyRequests,
        p_minute_tokens: c.tokensPerMinute,
        p_minute_requests: c.requestsPerMinute,
        p_workspace_minute_requests: c.workspaceRequestsPerMinute,
      });
      if (error || typeof data !== "boolean") throw unavailable();
      return data;
    },
    async settle(s) {
      const { error } = await createServiceClient(settings).rpc("settle_ai_budget", {
        p_id: s.id,
        p_input: s.usage?.inputTokens ?? null,
        p_output: s.usage?.outputTokens ?? null,
        p_status: s.status,
        p_latency: s.latencyMs,
        p_cost: s.estimatedCost,
      });
      if (error) throw unavailable();
    },
  };
}
