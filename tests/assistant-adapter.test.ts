import { beforeEach, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createSupabaseAssistantRepository } from "@/infrastructure/supabase/supabase-assistant-repository";
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/infrastructure/supabase/clients", () => ({
  createUserClient: async () => ({ rpc: mocks.read }),
  createServiceClient: () => ({ rpc: mocks.write }),
}));
const repo = createSupabaseAssistantRepository({
    url: "https://test.example",
    publishableKey: "public",
    secretKey: "private",
    secureCookies: true,
  }),
  s = { workspaceId: randomUUID(), brandId: randomUUID() },
  user = randomUUID(),
  conversation = randomUUID(),
  turn = {
    conversationId: conversation,
    turnId: randomUUID(),
    userMessageId: randomUUID(),
    assistantMessageId: randomUUID(),
    contextRevision: 1,
    status: "pending" as const,
    replay: false,
  };
const m = () => ({
  id: randomUUID(),
  conversation_id: conversation,
  turn_id: turn.turnId,
  role: "assistant",
  body: "Ready",
  status: "complete",
  created_at: "2026-10-15T00:00:00Z",
  revision: 1,
  proposals: [],
  confirmed: [],
  forgotten_at: null,
});
beforeEach(() => {
  mocks.read.mockReset();
  mocks.write.mockReset();
  mocks.write.mockResolvedValue({ data: {}, error: null });
});
it("cleans only authorized scoped history and maps bounded snapshot cursors", async () => {
  const messages = [m(), m(), m()];
  mocks.read.mockResolvedValue({
    data: {
      conversation: {
        id: conversation,
        context_revision: 2,
        context_after: "2026-10-15T00:00:00Z",
        revision: 3,
      },
      messages,
      memories: [
        {
          id: randomUUID(),
          scope: "brand",
          key: "style",
          value: "Calm",
          revision: 1,
          source_message_id: messages[0]!.id,
          updated_at: "2026-10-15T00:00:00Z",
        },
      ],
    },
    error: null,
  });
  const result = await repo.snapshot(s, user, null, 2);
  expect(result.messages).toHaveLength(2);
  expect(result.nextCursor).toContain(messages[1]!.id);
  expect(result.memories[0]!.sourceMessageId).toBe(messages[0]!.id);
  expect(mocks.write).toHaveBeenCalledWith(
    "assistant_mutate",
    expect.objectContaining({
      p_user: user,
      p_workspace: s.workspaceId,
      p_brand: s.brandId,
      p_operation: "cleanup",
    }),
  );
  await repo.exportPage(s, user, result.nextCursor, 2);
  expect(mocks.read).toHaveBeenLastCalledWith(
    "assistant_read",
    expect.objectContaining({ p_kind: "export" }),
  );
});
it("validates tool read results and sanitizes all storage errors", async () => {
  mocks.read.mockResolvedValue({ data: { videos_ready: "2" }, error: null });
  expect(await repo.stats(s, user)).toEqual({ videos_ready: "2" });
  mocks.read.mockResolvedValue({ data: { videos_ready: -1 }, error: null });
  await expect(repo.stats(s, user)).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  mocks.read.mockResolvedValue({ error: { code: "XX000", message: "PRIVATE database details" } });
  await expect(repo.stats(s, user)).rejects.toMatchObject({
    message: "The service is temporarily unavailable.",
  });
  mocks.write.mockResolvedValue({
    error: { code: "P0001", message: "assistant_rate_limited PRIVATE" },
  });
  await expect(repo.guard(s, user, turn)).rejects.toMatchObject({ code: "RATE_LIMITED" });
});
it("maps turn mutations to fixed RPC names and binds server user/scope", async () => {
  mocks.write.mockResolvedValueOnce({
    data: {
      conversation_id: conversation,
      turn_id: turn.turnId,
      user_message_id: turn.userMessageId,
      assistant_message_id: turn.assistantMessageId,
      context_revision: 1,
      status: "pending",
      replay: false,
    },
    error: null,
  });
  expect(
    await repo.begin(s, user, turn.turnId, "Hello", 240, 30, { minute: 6, day: 100 }),
  ).toMatchObject({ turnId: turn.turnId });
  await repo.guard(s, user, turn);
  await repo.finish(s, user, turn, "Final", []);
  await repo.fail(s, user, turn);
  await repo.memory(s, user, {
    id: null,
    revision: 0,
    scope: "personal",
    key: "tone",
    value: "Calm",
    forget: false,
  });
  await repo.confirm(s, user, randomUUID(), 0, null, 0);
  await repo.forget(s, user, null, 1);
  expect(mocks.write.mock.calls.map((c) => c[1].p_operation)).toEqual([
    "begin",
    "guard",
    "finish",
    "fail",
    "memory",
    "confirm",
    "forget",
  ]);
});
it("maps scoped history, sources and summary provenance", async () => {
  mocks.read.mockResolvedValue({
    data: [
      {
        id: turn.userMessageId,
        role: "user",
        body: "Old question",
        created_at: "2026-10-15T00:00:00Z",
      },
    ],
    error: null,
  });
  expect((await repo.history(s, user, "question", 6))[0]!.createdAt).toBe("2026-10-15T00:00:00Z");
  mocks.read.mockResolvedValue({
    data: [{ id: randomUUID(), title: "Source", format: "video", stage: "ready" }],
    error: null,
  });
  expect(await repo.contentHistory(s, user, "Source", 6)).toHaveLength(1);
  mocks.read.mockResolvedValue({ data: null, error: null });
  expect(await repo.message(s, user, randomUUID())).toBeNull();
  mocks.read.mockResolvedValue({ data: m(), error: null });
  expect((await repo.message(s, user, randomUUID()))!.body).toBe("Ready");
  mocks.write.mockResolvedValue({
    data: { text: "A summary", source_ids: [turn.userMessageId], context_revision: 1 },
    error: null,
  });
  expect(
    await repo.summary(
      s,
      user,
      { id: conversation, contextRevision: 1, contextAfter: "epoch", revision: 1 },
      [turn.userMessageId],
      100,
    ),
  ).toMatchObject({ sourceIds: [turn.userMessageId] });
  mocks.write.mockResolvedValue({ error: { code: "40001", message: "stale_revision" } });
  await expect(repo.guard(s, user, turn)).rejects.toMatchObject({ code: "CONFLICT" });
});
