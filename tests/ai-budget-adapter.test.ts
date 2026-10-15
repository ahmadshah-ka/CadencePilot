import { beforeEach, it, expect, vi } from "vitest";
import { createSupabaseAiBudget } from "@/infrastructure/supabase/supabase-ai-budget";
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/infrastructure/supabase/clients", () => ({ createServiceClient: () => ({ rpc }) }));
const budget = createSupabaseAiBudget({
  url: "https://db.example.test",
  publishableKey: "public",
  secretKey: "private",
  secureCookies: true,
});
const reservation = {
  id: "id",
  workspaceId: "workspace",
  brandId: "brand",
  userId: "user",
  traceId: "trace",
  provider: "groq",
  model: "configured",
  promptVersion: "check-v1",
  tokens: 500,
};
const caps = {
  globalDailyTokens: 10000,
  workspaceDailyTokens: 5000,
  globalDailyRequests: 100,
  workspaceDailyRequests: 20,
  tokensPerMinute: 5000,
  requestsPerMinute: 10,
  workspaceRequestsPerMinute: 2,
};
beforeEach(() => rpc.mockReset());
it("maps server-authorized scope and caps to a fixed admission RPC", async () => {
  rpc.mockResolvedValue({ data: true, error: null });
  expect(await budget.reserve(reservation, caps)).toBe(true);
  expect(rpc).toHaveBeenCalledWith(
    "reserve_ai_budget",
    expect.objectContaining({
      p_user: "user",
      p_workspace: "workspace",
      p_tokens: 500,
      p_global_day_tokens: 10000,
    }),
  );
});
it("maps unknown usage to nulls and fails closed on invalid responses", async () => {
  rpc.mockResolvedValue({ data: null, error: null });
  await budget.settle({
    id: "id",
    usage: null,
    status: "unknown",
    latencyMs: 1,
    estimatedCost: null,
  });
  expect(rpc).toHaveBeenCalledWith(
    "settle_ai_budget",
    expect.objectContaining({ p_input: null, p_output: null }),
  );
  await expect(budget.reserve(reservation, caps)).rejects.toMatchObject({
    code: "DEPENDENCY_UNAVAILABLE",
  });
  rpc.mockResolvedValue({ error: { message: "SECRET" } });
  await expect(
    budget.settle({
      id: "id",
      usage: { inputTokens: 3, outputTokens: 4 },
      status: "success",
      latencyMs: 1,
      estimatedCost: 0,
    }),
  ).rejects.toMatchObject({ message: "AI budget storage is unavailable." });
  await expect(budget.reserve(reservation, caps)).rejects.toMatchObject({
    code: "DEPENDENCY_UNAVAILABLE",
  });
});
