import { randomUUID } from "node:crypto";
import { beforeEach, it, expect, vi } from "vitest";
import {
  runAssistant,
  assistantCommand,
  assistantState,
  assistantSettings,
  assistantContext,
  assistantTools,
  type AssistantDeps,
} from "@/application/assistant/assistant-use-cases";
import { assistantPolicy } from "@/config/assistant-policy";
import onboarding from "@/config/onboarding-policy.json";
import type {
  AssistantRepository,
  AssistantMessage,
  AssistantSnapshot,
  AssistantScope,
  AssistantTurn,
} from "@/application/ports/assistant-repository";
import type { AiDeps } from "@/application/ai/run-ai";
import type { AiResult } from "@/application/ports/ai-provider";
import { assistantHandler } from "@/presentation/api/assistant-routes";
import {
  missingPreferences,
  renderVerifiedAnswer,
  provisionalAnswer,
} from "@/domain/assistant/assistant-rules";
import { AppError } from "@/domain/errors/app-error";
import {
  makeWorld,
  VALID_ENV,
  ALICE_ID,
  BOB_ID,
  jsonRequest,
  type TestWorld,
} from "./support/fakes";
let world: TestWorld,
  d: AssistantDeps,
  ai: AiDeps,
  s: AssistantScope,
  state: AssistantSnapshot,
  t: AssistantTurn,
  repo: AssistantRepository,
  selectedTools: { id: string; name: string; arguments: unknown }[],
  answer: string,
  events: { type: string; data: unknown }[];
const principal = {
    userId: ALICE_ID,
    accountStatus: "approved" as const,
    isOwner: false,
    mfaVerified: false,
  },
  trace = randomUUID();
let personal: {
  userId: string;
  revision: number;
  settings: { timezone: string; availability: []; weeklyAvailability: [] };
} | null;
const emit = async (type: "status" | "delta" | "done", data: unknown) => {
  events.push({ type, data });
};
const input = (extra: Record<string, unknown> = {}) => ({
  requestId: randomUUID(),
  text: "What have I made?",
  mode: "chat",
  compareBrandIds: [],
  ...extra,
});
const call = (extra: Record<string, unknown> = {}) =>
  runAssistant(d, principal, s, input(extra), trace, new AbortController().signal, emit);
function message(proposals: AssistantMessage["proposals"] = []): AssistantMessage {
  return {
    id: randomUUID(),
    conversationId: t.conversationId,
    turnId: t.turnId,
    role: "assistant",
    body: "Review",
    status: "complete",
    createdAt: "2026-10-15T00:00:00Z",
    revision: 1,
    proposals,
    confirmed: [],
    forgottenAt: null,
  };
}
beforeEach(async () => {
  world = makeWorld(VALID_ENV);
  world.access.add(ALICE_ID, "approved");
  world.access.add(BOB_ID, "approved");
  world.identity.signIn(ALICE_ID);
  const workspaceId = await world.workspaces.createInitialWorkspace("Studio"),
    brand = await world.workspaces.createBrand(workspaceId, {
      name: "Brand",
      profile: {},
      targets: {},
    });
  s = { workspaceId, brandId: brand.id };
  personal = null;
  t = {
    conversationId: randomUUID(),
    turnId: randomUUID(),
    userMessageId: randomUUID(),
    assistantMessageId: randomUUID(),
    contextRevision: 1,
    status: "pending",
    replay: false,
  };
  state = {
    conversation: {
      id: t.conversationId,
      contextRevision: 1,
      contextAfter: "1970-01-01T00:00:00Z",
      revision: 1,
    },
    messages: [],
    memories: [],
    memoryTruncated: false,
    nextCursor: null,
  };
  repo = {
    message: vi.fn(async () => null),
    snapshot: vi.fn(async () => state),
    exportPage: vi.fn(async () => state),
    begin: vi.fn(async () => t),
    guard: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
    fail: vi.fn(async () => {}),
    stats: vi.fn(async () => ({ videos_ready: "2", publications: "3" })),
    history: vi.fn(async () => []),
    contentHistory: vi.fn(async () => []),
    summary: vi.fn(async () => ({ text: "", sourceIds: [], contextRevision: 1 })),
    memory: vi.fn(async () => {}),
    confirm: vi.fn(async () => {}),
    forget: vi.fn(async () => {}),
  };
  selectedTools = [];
  answer = "Ready videos: [stat:videos_ready].";
  events = [];
  let now = 0;
  ai = {
    workspaces: world.workspaces,
    provider: {
      name: "fake",
      model: "fixture",
      capabilities: { streaming: true, tools: true, structured: true, contextTokens: 131072 },
      generate: vi.fn(async (req, delta) => {
        if (req.tools.length)
          return {
            text: selectedTools.length ? "" : "I will inspect the records.",
            toolCalls: selectedTools,
            finishReason: selectedTools.length ? "tool_calls" : "stop",
            usage: { inputTokens: 30, outputTokens: 20 },
          };
        await delta?.(answer);
        return {
          text: answer,
          toolCalls: [],
          finishReason: "stop",
          usage: { inputTokens: 40, outputTokens: 30 },
        } as AiResult;
      }),
    },
    budget: { reserve: vi.fn(async () => true), settle: vi.fn(async () => {}) },
    logger: world.container.logger,
    now: () => now++,
    newId: randomUUID,
    sleep: vi.fn(async () => {}),
    policy: {
      enabled: true,
      timeoutMs: 1000,
      maxRetries: 0,
      contextTokens: 20000,
      outputTokens: 1500,
      overheadTokens: 256,
      maxTools: 16,
      maxToolCalls: 4,
      maxMessages: 64,
      retryDelayMs: 1,
      maxRetryDelayMs: 10,
      caps: {
        globalDailyTokens: 100000,
        workspaceDailyTokens: 50000,
        globalDailyRequests: 100,
        workspaceDailyRequests: 20,
        tokensPerMinute: 50000,
        requestsPerMinute: 20,
        workspaceRequestsPerMinute: 10,
      },
    },
  };
  d = {
    repository: repo,
    preferences: {
      get: vi.fn(async () => personal),
      save: vi.fn(async () => {
        throw new Error("not used");
      }),
    },
    workspace: {
      workspaces: world.workspaces,
      logger: world.container.logger,
      limits: world.container.config.ok ? world.container.config.config.limits : never(),
    },
    onboarding,
    policy: assistantPolicy,
    ai: () => ai,
    prompt: async () => "Use records. Never write literal numerals; use supplied stat references.",
    newId: randomUUID,
    now: () => 1000,
  };
});
function never(): never {
  throw new Error("invalid test config");
}
it("streams provisional text, resolves DB references, and commits only the final paired response", async () => {
  await call();
  expect(repo.finish).toHaveBeenCalledWith(s, ALICE_ID, t, "Ready videos: 2.", []);
  expect(events.some((e) => e.type === "delta")).toBe(true);
  expect(events.at(-1)!.type).toBe("done");
  expect(ai.provider.generate).toHaveBeenCalledTimes(2);
  expect(repo.memory).not.toHaveBeenCalled();
});
it("rejects invented numerical totals and unknown stat references without committing", async () => {
  for (const bad of ["You made 999999 videos.", "[stat:imagined]", "[stat:bad"]) {
    answer = bad;
    await expect(call()).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  }
  expect(repo.finish).not.toHaveBeenCalled();
  expect(repo.fail).toHaveBeenCalledTimes(3);
});
it("validates missing questionnaire fields and a zero permanent target", () => {
  expect(
    missingPreferences(
      {
        topic: "T",
        audience: "A",
        tone: "C",
        platforms: ["youtube"],
        targets: { videos: 0, shorts: 0, posts: 0 },
      },
      { timezone: "UTC", availability: [] },
    ),
  ).toEqual([]);
  expect(missingPreferences({}, {})).toContain("targets.videos");
  expect(provisionalAnswer("999 [stat:videos_ready] [stat:unfinished", { videos_ready: "2" })).toBe(
    "··· 2 …",
  );
  expect(() => renderVerifiedAnswer("", {}, 10)).toThrow();
  expect(() => renderVerifiedAnswer("x".repeat(11), {}, 10)).toThrow();
});
it.each([
  null,
  { ...principal, accountStatus: "suspended" as const },
  { ...principal, userId: BOB_ID, isOwner: true },
])("denies unauthorized assistant access", async (p) => {
  await expect(
    runAssistant(d, p, s, input(), trace, new AbortController().signal, emit),
  ).rejects.toBeDefined();
  expect(repo.begin).not.toHaveBeenCalled();
});
it("validates scope, archived brand, message contracts and comparison limits", async () => {
  await expect(
    runAssistant(
      d,
      principal,
      { ...s, brandId: "bad" },
      input(),
      trace,
      new AbortController().signal,
      emit,
    ),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  await expect(
    call({ text: "x".repeat(assistantPolicy.messageMaxLength + 1) }),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(call({ mode: "invalid" })).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(call({ compareBrandIds: Array(4).fill(randomUUID()) })).rejects.toMatchObject({
    code: "INVALID_REQUEST",
  });
  await world.workspaces.updateBrand(s.workspaceId, s.brandId, 1, { archived: true });
  await expect(call()).rejects.toMatchObject({ code: "CONFLICT" });
});
it("exposes no cross-brand memory while allowing only explicit authorized count comparisons", async () => {
  const other = await world.workspaces.createBrand(s.workspaceId, {
    name: "Other",
    profile: {},
    targets: {},
  });
  await call({ compareBrandIds: [other.id, other.id] });
  expect(repo.snapshot).toHaveBeenCalledTimes(1);
  expect(repo.snapshot).toHaveBeenCalledWith(s, ALICE_ID, null, assistantPolicy.pageSize);
  expect(repo.stats).toHaveBeenCalledWith({ ...s, brandId: other.id }, ALICE_ID);
  const final = vi.mocked(ai.provider.generate).mock.calls[1]![0];
  expect(JSON.stringify(final.messages)).toContain("compare_a_videos_ready");
});
it("stops a comparison response when a compared brand is revoked during streaming", async () => {
  const other = await world.workspaces.createBrand(s.workspaceId, {
    name: "Other",
    profile: {},
    targets: {},
  });
  ai.provider.generate = vi.fn(async (req, delta) => {
    if (req.tools.length)
      return {
        text: "I will inspect the records.",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 30, outputTokens: 20 },
      };
    await world.workspaces.updateBrand(s.workspaceId, other.id, other.revision, { archived: true });
    await delta?.(answer);
    return {
      text: answer,
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 40, outputTokens: 30 },
    };
  });
  await expect(call({ compareBrandIds: [other.id] })).rejects.toBeDefined();
  expect(repo.fail).toHaveBeenCalled();
  expect(repo.finish).not.toHaveBeenCalled();
  expect(events.some((event) => event.type === "done")).toBe(false);
});
it("denies a model-forged brand ID before any tool is executed", async () => {
  selectedTools = [{ id: "forged", name: "brand_stats", arguments: { brandId: randomUUID() } }];
  await expect(call()).rejects.toBeDefined();
  expect(repo.finish).not.toHaveBeenCalled();
});
it("executes only bounded selected-brand read tools and preserves summary provenance", async () => {
  const source = {
    id: randomUUID(),
    role: "user",
    body: "Old pineapple",
    createdAt: "2026-10-15T00:00:00Z",
  };
  repo.history = vi.fn(async () => [source]);
  selectedTools = [
    { id: "s", name: "brand_stats", arguments: {} },
    { id: "h", name: "content_history", arguments: { query: "pineapple" } },
    { id: "p", name: "current_settings", arguments: {} },
  ];
  await call();
  expect(repo.contentHistory).toHaveBeenCalledWith(
    s,
    ALICE_ID,
    "pineapple",
    assistantPolicy.searchLimit,
  );
  expect(repo.summary).toHaveBeenCalledWith(
    s,
    ALICE_ID,
    state.conversation,
    [source.id],
    assistantPolicy.summaryExcerptLength,
  );
});
it("proposes a memory without saving it and requires explicit confirmation", async () => {
  selectedTools = [
    { id: "m", name: "propose_memory", arguments: { scope: "brand", key: "style", value: "Calm" } },
  ];
  await call();
  expect(repo.finish).toHaveBeenCalledWith(s, ALICE_ID, t, expect.any(String), [
    { kind: "memory", scope: "brand", key: "style", value: "Calm" },
  ]);
  expect(repo.memory).not.toHaveBeenCalled();
  const m = message([{ kind: "memory", scope: "brand", key: "style", value: "Calm" }]);
  repo.message = vi.fn(async () => m);
  await assistantCommand(d, principal, s, {
    action: "confirm",
    input: { messageId: m.id, index: 0 },
  });
  expect(repo.confirm).toHaveBeenCalledWith(s, ALICE_ID, m.id, 0, null, 0);
  m.confirmed = [0];
  await assistantCommand(d, principal, s, {
    action: "confirm",
    input: { messageId: m.id, index: 0 },
  });
  expect(repo.confirm).toHaveBeenCalledTimes(1);
});
it("proposes validated onboarding settings and applies them only after confirmation", async () => {
  selectedTools = [
    { id: "p", name: "propose_preference", arguments: { field: "targets.videos", value: "2" } },
  ];
  await call({ mode: "onboarding" });
  const proposals = vi.mocked(repo.finish).mock.calls[0]![4];
  expect(proposals).toEqual([
    { kind: "preference", field: "targets.videos", value: "2", before: null },
  ]);
  expect(repo.confirm).not.toHaveBeenCalled();
  const m = message(proposals);
  repo.message = vi.fn(async () => m);
  await assistantCommand(d, principal, s, {
    action: "confirm",
    input: { messageId: m.id, index: 0 },
  });
  expect(repo.confirm).toHaveBeenCalledWith(
    s,
    ALICE_ID,
    m.id,
    0,
    expect.objectContaining({ targets: { videos: 2 }, weeklyTargets: [] }),
    1,
  );
});
it.each([
  ["platforms", '["unknown"]'],
  ["targets.videos", "-1"],
  ["availability", "broken"],
  ["timezone", "Mars/Nowhere"],
])("rejects invalid proposed setting %s", async (field, value) => {
  selectedTools = [{ id: "p", name: "propose_preference", arguments: { field, value } }];
  await expect(call({ mode: "onboarding" })).rejects.toBeDefined();
  expect(repo.finish).not.toHaveBeenCalled();
});
it("rejects duplicate setting proposals, oversized memories and unknown tools", async () => {
  selectedTools = [
    { id: "p", name: "propose_preference", arguments: { field: "tone", value: "Calm" } },
    { id: "q", name: "propose_preference", arguments: { field: "tone", value: "Bold" } },
  ];
  await expect(call({ mode: "onboarding" })).rejects.toBeDefined();
  selectedTools = [
    {
      id: "m",
      name: "propose_memory",
      arguments: { scope: "brand", key: "style", value: "x".repeat(1001) },
    },
  ];
  await expect(call()).rejects.toBeDefined();
  selectedTools = [{ id: "x", name: "execute_sql", arguments: {} }];
  await expect(call()).rejects.toBeDefined();
});
it("preserves current user input and drops optional over-budget context", () => {
  ai.policy.contextTokens = 900;
  const m = assistantContext(ai, "Prompt", "Question", {}, [
    { secret: "x".repeat(3000) },
    { small: "ok" },
  ]);
  expect(m.at(-1)!.content).toBe("Question");
  expect(JSON.stringify(m)).not.toContain("secret");
  expect(JSON.stringify(m)).toContain("small");
  expect(() => assistantContext(ai, "x".repeat(1000), "Question", {}, [])).toThrow();
  expect(
    assistantTools("onboarding", assistantPolicy).some((t) => t.name === "propose_preference"),
  ).toBe(true);
});
it("handles normal small prompts under the existing default context budget", async () => {
  ai.policy.contextTokens = 3000;
  await call();
  expect(repo.finish).toHaveBeenCalled();
});
it("marks interrupted/revoked streams failed and emits no completed response", async () => {
  repo.guard = vi.fn(async () => {
    throw new AppError("NOT_FOUND", "Not found.");
  });
  await expect(call()).rejects.toBeDefined();
  expect(repo.fail).toHaveBeenCalled();
  expect(repo.finish).not.toHaveBeenCalled();
  expect(events.some((e) => e.type === "done")).toBe(false);
});
it("rejects oversized streamed answers and keeps failure cleanup sanitized", async () => {
  answer = "x".repeat(assistantPolicy.answerMaxLength + 1);
  repo.fail = vi.fn(async () => {
    throw new Error("PRIVATE DB BODY");
  });
  await expect(call()).rejects.toBeDefined();
  expect(repo.finish).not.toHaveBeenCalled();
});
it("replays an existing completed request without another provider call", async () => {
  t.replay = true;
  t.status = "complete";
  await call();
  expect(ai.provider.generate).not.toHaveBeenCalled();
  expect(events).toEqual([{ type: "done", data: { replay: true, status: "complete" } }]);
});
it("uses personal proposals separately and rejects stale preference proposals", async () => {
  personal = {
    userId: ALICE_ID,
    revision: 3,
    settings: { timezone: "", availability: [], weeklyAvailability: [] },
  };
  const m = message([
    { kind: "preference", field: "timezone", value: "Europe/London", before: "" },
  ]);
  repo.message = vi.fn(async () => m);
  await assistantCommand(d, principal, s, {
    action: "confirm",
    input: { messageId: m.id, index: 0 },
  });
  expect(repo.confirm).toHaveBeenCalledWith(
    s,
    ALICE_ID,
    m.id,
    0,
    expect.objectContaining({ timezone: "Europe/London" }),
    3,
  );
  m.proposals[0]!.before = "old";
  await expect(
    assistantCommand(d, principal, s, { action: "confirm", input: { messageId: m.id, index: 0 } }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});
it("requires literal confirmation for forgetting and validates memory edits", async () => {
  await expect(
    assistantCommand(d, principal, s, {
      action: "forget-conversation",
      input: { id: null, revision: 1, confirmed: false },
    }),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await assistantCommand(d, principal, s, {
    action: "forget-conversation",
    input: { id: null, revision: 1, confirmed: true },
  });
  expect(repo.forget).toHaveBeenCalledWith(s, ALICE_ID, null, 1);
  const mem = {
    id: null,
    revision: 0,
    scope: "personal",
    key: "tone",
    value: "Calm",
    forget: false,
  };
  await assistantCommand(d, principal, s, { action: "memory", input: mem });
  expect(repo.memory).toHaveBeenCalledWith(s, ALICE_ID, mem);
  await expect(
    assistantCommand(d, principal, s, { action: "memory", input: { ...mem, key: "bad key" } }),
  ).rejects.toBeDefined();
  await expect(
    assistantCommand(d, principal, s, {
      action: "forget-message",
      input: { id: null, revision: 1, confirmed: true },
    }),
  ).rejects.toBeDefined();
});
it("revalidates stored memory proposals against the current configured limits", async () => {
  const m = message([
    { kind: "memory", scope: "brand", key: "tone", value: "Too long for the current policy" },
  ]);
  repo.message = vi.fn(async () => m);
  d.policy = { ...assistantPolicy, memoryValueMaxLength: 4 };
  await expect(
    assistantCommand(d, principal, s, {
      action: "confirm",
      input: { messageId: m.id, index: 0 },
    }),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  expect(repo.confirm).not.toHaveBeenCalled();
});
it("exports scoped pages and rejects malformed cursors and unavailable source proposals", async () => {
  const exported = await assistantState(d, principal, s, null, true);
  expect(exported.retentionDays).toBe(assistantPolicy.retentionDays);
  expect(repo.exportPage).toHaveBeenCalledWith(s, ALICE_ID, null, assistantPolicy.pageSize);
  await expect(assistantState(d, principal, s, "bad-cursor")).rejects.toBeDefined();
  await expect(
    assistantCommand(d, principal, s, {
      action: "confirm",
      input: { messageId: randomUUID(), index: 0 },
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await assistantSettings(d, principal, s)).missing).toContain("timezone");
});
it("protects API state, source, mutation, export and streaming paths", async () => {
  const route = { params: Promise.resolve({ ...s }) },
    factory = () => world.container,
    deps = () => d;
  const stateRoute = assistantHandler("state", factory, deps);
  expect((await stateRoute(jsonRequest("/assistant"), route)).status).toBe(200);
  expect(
    (await assistantHandler("export", factory, deps)(jsonRequest("/assistant/export"), route))
      .status,
  ).toBe(200);
  expect(
    (
      await assistantHandler(
        "source",
        factory,
        deps,
      )(jsonRequest("/assistant/source?messageId=" + randomUUID()), route)
    ).status,
  ).toBe(404);
  const chat = await assistantHandler(
    "chat",
    factory,
    deps,
  )(jsonRequest("/assistant/chat", { method: "POST", body: input() }), route);
  expect(chat.headers.get("content-type")).toContain("text/event-stream");
  expect(await chat.text()).toContain("event: done");
  expect(
    (
      await assistantHandler(
        "command",
        factory,
        deps,
      )(
        jsonRequest("/assistant/commands", {
          method: "POST",
          origin: "https://evil.test",
          body: {},
        }),
        route,
      )
    ).status,
  ).toBe(403);
  world.identity.signIn(BOB_ID);
  expect((await stateRoute(jsonRequest("/assistant"), route)).status).toBe(404);
});
it("turns streaming failures into a safe SSE error without logging private provider data", async () => {
  answer = "999999";
  const response = await assistantHandler(
    "chat",
    () => world.container,
    () => d,
  )(jsonRequest("/assistant/chat", { method: "POST", body: input() }), {
    params: Promise.resolve({ ...s }),
  });
  expect(await response.text()).toContain("event: error");
});
