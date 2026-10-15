import { beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { runAi, type AiCall, type AiDeps } from "@/application/ai/run-ai";
import { AiProviderError, type AiResult, type AiProvider } from "@/application/ports/ai-provider";
import { inputTokenBound, assertAiCapabilities } from "@/domain/ai/ai-rules";
import { aiProbeHandler } from "@/presentation/api/ai-routes";
import { createAiDeps } from "@/infrastructure/ai/ai-dependencies";
import { loadConfig, parseConfig } from "@/config/load-config";
import {
  makeWorld,
  VALID_ENV,
  ALICE_ID,
  BOB_ID,
  jsonRequest,
  type TestWorld,
} from "./support/fakes";
let deps: AiDeps, call: AiCall, world: TestWorld;
const p = {
  userId: ALICE_ID,
  accountStatus: "approved" as const,
  isOwner: false,
  mfaVerified: false,
};
const result = (): AiResult => ({
  text: '{"status":"ok"}',
  toolCalls: [],
  finishReason: "stop",
  usage: { inputTokens: 12, outputTokens: 6 },
});
const output = {
  name: "test",
  schema: {
    type: "object",
    properties: { status: { type: "string" } },
    additionalProperties: false,
    required: ["status"],
  },
  validate: z.object({ status: z.literal("ok") }).strict(),
};
beforeEach(async () => {
  world = makeWorld(VALID_ENV);
  world.access.add(ALICE_ID, "approved");
  world.access.add(BOB_ID, "approved");
  world.identity.signIn(ALICE_ID);
  const workspaceId = await world.workspaces.createInitialWorkspace("AI Studio"),
    brand = await world.workspaces.createBrand(workspaceId, {
      name: "One",
      profile: {},
      targets: {},
    });
  call = {
    workspaceId,
    brandId: brand.id,
    traceId: randomUUID(),
    requestId: randomUUID(),
    promptVersion: "test-v1",
    messages: [{ role: "user", content: "Private input CANARY" }],
  };
  deps = {
    workspaces: world.workspaces,
    provider: {
      name: "fake",
      model: "test",
      capabilities: { streaming: true, structured: true, tools: true, contextTokens: 10000 },
      generate: vi.fn(async () => result()),
    },
    budget: { reserve: vi.fn(async () => true), settle: vi.fn(async () => {}) },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() },
    policy: {
      enabled: true,
      timeoutMs: 1000,
      maxRetries: 1,
      contextTokens: 3000,
      outputTokens: 100,
      overheadTokens: 100,
      maxTools: 4,
      maxToolCalls: 2,
      maxMessages: 8,
      retryDelayMs: 1,
      maxRetryDelayMs: 100,
      inputCostPerMillion: 1,
      outputCostPerMillion: 2,
      caps: {
        globalDailyTokens: 10000,
        workspaceDailyTokens: 5000,
        globalDailyRequests: 100,
        workspaceDailyRequests: 20,
        tokensPerMinute: 5000,
        requestsPerMinute: 10,
        workspaceRequestsPerMinute: 2,
      },
    },
    now: () => 1000,
    newId: randomUUID,
    sleep: vi.fn(async () => {}),
  };
});
describe("AI admission and phase contracts", () => {
  it("reserves before dispatch, reconciles actual usage and logs no private context", async () => {
    const order: string[] = [];
    deps.budget.reserve = vi.fn(async () => {
      order.push("reserve");
      return true;
    });
    deps.provider.generate = vi.fn(async () => {
      order.push("provider");
      return result();
    });
    expect((await runAi(deps, p, { ...call, output })).data).toEqual({ status: "ok" });
    expect(order).toEqual(["reserve", "provider"]);
    expect(deps.budget.settle).toHaveBeenCalledWith(
      expect.objectContaining({
        usage: { inputTokens: 12, outputTokens: 6 },
        estimatedCost: 0.000024,
        status: "success",
      }),
    );
    expect(JSON.stringify(vi.mocked(deps.logger.info).mock.calls)).not.toContain("CANARY");
  });
  it("denies exhausted or duplicate admission before any provider call", async () => {
    deps.budget.reserve = vi.fn(async () => false);
    await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(deps.provider.generate).not.toHaveBeenCalled();
  });
  it.each([
    null,
    { ...p, accountStatus: "suspended" as const },
    { ...p, userId: BOB_ID, isOwner: true },
  ])("rejects unauthorized callers before budget access", async (principal) => {
    await expect(runAi(deps, principal, call)).rejects.toBeDefined();
    expect(deps.budget.reserve).not.toHaveBeenCalled();
  });
  it("rejects malformed scope, foreign brand and archived brand", async () => {
    await expect(runAi(deps, p, { ...call, brandId: "bad" })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(runAi(deps, p, { ...call, brandId: randomUUID() })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await world.workspaces.updateBrand(call.workspaceId, call.brandId, 1, { archived: true });
    await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "CONFLICT" });
  });
  it("fails safely when disabled or context/input is invalid", async () => {
    deps.policy.enabled = false;
    await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
    deps.policy.enabled = true;
    await expect(runAi(deps, p, { ...call, messages: [] })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    await expect(
      runAi(deps, p, { ...call, messages: [{ role: "user", content: "x".repeat(5000) }] }),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    deps.provider.capabilities.contextTokens = 1;
    await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(deps.budget.reserve).not.toHaveBeenCalled();
  });
  it("rejects incompatible capabilities and duplicate tool names", async () => {
    const t = {
      name: "lookup",
      description: "lookup",
      parameters: { type: "object" },
      validate: z.object({}),
    };
    for (const bad of [{ stream: true, output }, { tools: [t], output }, { tools: [t, t] }])
      await expect(runAi(deps, p, { ...call, ...bad })).rejects.toMatchObject({
        code: "INVALID_REQUEST",
      });
    for (const key of ["streaming", "tools", "structured"] as const) {
      const c = { ...deps.provider.capabilities, [key]: false };
      expect(() =>
        assertAiCapabilities(
          c,
          key === "streaming",
          key === "tools" ? [t] : [],
          key === "structured" ? output : undefined,
        ),
      ).toThrow();
    }
  });
  it("conservatively counts unicode and schema bytes", () => {
    expect(inputTokenBound([{ role: "user", content: "é" }], [], output, 100)).toBeGreaterThan(
      inputTokenBound([{ role: "user", content: "e" }], [], undefined, 100),
    );
  });
  it("validates tool proposals but never executes them", async () => {
    const t = {
      name: "lookup",
      description: "lookup",
      parameters: { type: "object" },
      validate: z.object({ query: z.string() }).strict(),
    };
    deps.provider.generate = vi.fn(async () => ({
      ...result(),
      finishReason: "tool_calls",
      toolCalls: [{ id: "one", name: "lookup", arguments: { query: "topic" } }],
    }));
    const got = await runAi(deps, p, { ...call, tools: [t] });
    expect(got.toolCalls[0]!.name).toBe("lookup");
  });
  it.each([
    "wrong-tool",
    "bad-arguments",
    "too-many",
    "unexpected-tool",
    "truncated",
    "json",
    "schema",
    "bad-usage",
  ])("rejects invalid model output: %s", async (kind) => {
    const t = {
      name: "lookup",
      description: "lookup",
      parameters: { type: "object" },
      validate: z.object({ query: z.string() }),
    };
    const bad = result();
    let extra: Partial<AiCall> = {};
    if (
      kind === "wrong-tool" ||
      kind === "bad-arguments" ||
      kind === "unexpected-tool" ||
      kind === "too-many"
    ) {
      bad.toolCalls = [
        {
          id: "one",
          name: kind === "wrong-tool" ? "delete" : "lookup",
          arguments: { query: kind === "bad-arguments" ? 1 : "ok" },
        },
      ];
      if (kind !== "unexpected-tool") extra = { tools: [t] };
      if (kind === "too-many") bad.toolCalls = Array(3).fill(bad.toolCalls[0]);
    }
    if (kind === "truncated") bad.finishReason = "length";
    if (kind === "json" || kind === "schema") {
      extra = { output };
      bad.text = kind === "json" ? "malformed" : '{"status":"wrong"}';
    }
    if (kind === "bad-usage") bad.usage = { inputTokens: -1, outputTokens: 2 };
    deps.provider.generate = vi.fn(async () => bad);
    await expect(runAi(deps, p, { ...call, ...extra })).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
    expect(deps.budget.settle).toHaveBeenCalled();
  });
  it("keeps unknown charges on outage, disconnect or missing usage", async () => {
    deps.provider.generate = vi.fn(async () => {
      throw new Error("PRIVATE provider body");
    });
    await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
    expect(deps.budget.settle).toHaveBeenCalledWith(
      expect.objectContaining({ usage: null, status: "unknown", estimatedCost: null }),
    );
    deps.provider.generate = vi.fn(async () => ({ ...result(), usage: null }));
    await runAi(deps, p, call);
    expect(deps.budget.settle).toHaveBeenLastCalledWith(expect.objectContaining({ usage: null }));
  });
  it("retries only bounded 429s and reserves separately for each attempt", async () => {
    const gen = vi
      .fn()
      .mockRejectedValueOnce(new AiProviderError("rate_limit", "zero", 50))
      .mockResolvedValue(result());
    deps.provider.generate = gen;
    await runAi(deps, p, call);
    expect(deps.sleep).toHaveBeenCalledWith(50, expect.any(AbortSignal));
    expect(deps.budget.reserve).toHaveBeenCalledTimes(2);
    const reservations = vi.mocked(deps.budget.reserve).mock.calls;
    expect(reservations[0]![0].id).toBe(call.requestId);
    expect(reservations[1]![0].id).not.toBe(call.requestId);
    expect(deps.budget.settle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ usage: { inputTokens: 0, outputTokens: 0 }, status: "failed" }),
    );
  });
  it("uses configured delay when no hint is supplied, caps retries, and preserves long hints", async () => {
    deps.provider.generate = vi.fn(async () => {
      throw new AiProviderError("rate_limit", "zero");
    });
    await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(deps.provider.generate).toHaveBeenCalledTimes(2);
    expect(deps.sleep).toHaveBeenCalledWith(1, expect.any(AbortSignal));
    vi.mocked(deps.provider.generate).mockClear();
    deps.provider.generate = vi.fn(async () => {
      throw new AiProviderError("rate_limit", "zero", 1000);
    });
    await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(deps.provider.generate).toHaveBeenCalledTimes(1);
  });
  it("never retries after a streamed delta and retains its reservation on callback failure", async () => {
    deps.provider.generate = vi.fn(async (_r, delta) => {
      await delta?.("hello");
      throw new AiProviderError("rate_limit", "unknown", 1);
    });
    const receive = vi.fn(async () => {});
    await expect(runAi(deps, p, { ...call, stream: true }, receive)).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
    expect(receive).toHaveBeenCalledWith("hello");
    expect(deps.sleep).not.toHaveBeenCalled();
  });
  it("cancels before admission and never calls provider after a failed settlement", async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(runAi(deps, p, { ...call, signal: abort.signal })).rejects.toBeDefined();
    expect(deps.budget.reserve).not.toHaveBeenCalled();
    deps.budget.settle = vi.fn(async () => {
      throw new Error("storage failed");
    });
    await expect(runAi(deps, p, call)).rejects.toThrow("storage failed");
    expect(deps.provider.generate).toHaveBeenCalledTimes(1);
  });
  it("supports an alternate provider through the same contract without pricing assumptions", async () => {
    const alternate: AiProvider = {
      ...deps.provider,
      name: "alternate",
      generate: async () => result(),
    };
    deps.provider = alternate;
    delete deps.policy.inputCostPerMillion;
    await runAi(deps, p, call);
    expect(deps.budget.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "alternate" }),
      deps.policy.caps,
    );
    expect(deps.budget.settle).toHaveBeenCalledWith(
      expect.objectContaining({ estimatedCost: null }),
    );
  });
});
describe("AI cancellation and conservative metering", () => {
  it("passes a finite deadline and keeps unknown usage on timeout", async () => {
    deps.policy.timeoutMs = 1;
    deps.provider.generate = vi.fn(async (request) => {
      await new Promise<void>((resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(request.signal.reason), {
          once: true,
        });
      });
      return result();
    });
    await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
    expect(deps.budget.settle).toHaveBeenCalledWith(
      expect.objectContaining({ usage: null, status: "unknown" }),
    );
  });
  it("charges actual provider overages and emits only safe warning metrics", async () => {
    deps.provider.generate = vi.fn(async () => ({
      ...result(),
      usage: { inputTokens: 5000, outputTokens: 1000 },
    }));
    await runAi(deps, p, call);
    expect(deps.logger.warn).toHaveBeenCalledWith(
      "ai usage exceeded reservation",
      expect.objectContaining({ actualTokens: 6000 }),
    );
  });
});
describe("empty completion validation", () => {
  it.each(["stop", "tool_calls"])(
    "rejects an empty %s result after metering known usage",
    async (finishReason) => {
      deps.provider.generate = vi.fn(async () => ({ ...result(), text: "", finishReason }));
      await expect(runAi(deps, p, call)).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
      expect(deps.budget.settle).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed", usage: { inputTokens: 12, outputTokens: 6 } }),
      );
    },
  );
});
describe("AI entrypoint and configuration", () => {
  it("accepts only an owner with own workspace, Origin and validated body", async () => {
    world.access.owners.add(ALICE_ID);
    world.identity.signIn(ALICE_ID, "aal2");
    const handler = aiProbeHandler(
        () => world.container,
        () => deps,
      ),
      route = { params: Promise.resolve({ workspaceId: call.workspaceId, brandId: call.brandId }) };
    expect(
      (
        await handler(
          jsonRequest("/ai", { method: "POST", body: { requestId: call.requestId } }),
          route,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await handler(
          jsonRequest("/ai", {
            method: "POST",
            body: { requestId: call.requestId, apiKey: "forged" },
          }),
          route,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await handler(
          new Request("http://localhost:3000/ai", { method: "POST", body: "{}" }),
          route,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handler(jsonRequest("/ai", { method: "POST", body: { requestId: call.requestId } }), {
          params: Promise.resolve({ workspaceId: "bad", brandId: call.brandId }),
        })
      ).status,
    ).toBe(404);
    world.identity.signIn(BOB_ID);
    expect(
      (
        await handler(
          jsonRequest("/ai", { method: "POST", body: { requestId: call.requestId } }),
          route,
        )
      ).status,
    ).toBe(403);
  });
  it("does not create AI dependencies when disabled", () => {
    expect(() => createAiDeps(world.container)).toThrow();
  });
  const enabled = {
    ...VALID_ENV,
    LLM_ENABLED: "true",
    SUPABASE_SECRET_KEY: "private",
    LLM_API_KEY: "private-api",
    LLM_GLOBAL_DAILY_TOKEN_CAP: "10000",
    LLM_WORKSPACE_DAILY_TOKEN_CAP: "5000",
    LLM_GLOBAL_TOKENS_PER_MINUTE: "5000",
    LLM_GLOBAL_REQUESTS_PER_MINUTE: "10",
  };
  it("wires configured adapter and rejects unsafe endpoint/model/budget settings", () => {
    const c = { ...world.container, config: { ok: true as const, config: loadConfig(enabled) } };
    expect(createAiDeps(c).provider.name).toBe("groq");
    for (const change of [
      { LLM_MODEL: "unknown" },
      { LLM_MODEL: "toString" },
      { LLM_BASE_URL: "http://internal" },
      { SUPABASE_SECRET_KEY: "" },
      { LLM_GLOBAL_DAILY_REQUEST_CAP: "1" },
      { LLM_GLOBAL_REQUESTS_PER_MINUTE: "1" },
    ])
      expect(parseConfig({ ...enabled, ...change }).ok).toBe(false);
  });
});
