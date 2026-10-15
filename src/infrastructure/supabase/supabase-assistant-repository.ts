import "server-only";
import { z } from "zod";
import type {
  AssistantRepository,
  AssistantScope,
  AssistantTurn,
  AssistantSnapshot,
} from "@/application/ports/assistant-repository";
import { AppError } from "@/domain/errors/app-error";
import { createUserClient, createServiceClient, type SupabaseSettings } from "./clients";
import { mapDatabaseError } from "./db-errors";
const proposal = z.object({
  kind: z.enum(["memory", "preference"]),
  scope: z.enum(["personal", "brand"]).optional(),
  key: z.string().optional(),
  value: z.string(),
  field: z.string().optional(),
  before: z.unknown().optional(),
});
const message = z.object({
  id: z.uuid(),
  conversation_id: z.uuid(),
  turn_id: z.uuid(),
  role: z.enum(["user", "assistant"]),
  body: z.string().nullable(),
  status: z.enum(["pending", "complete", "failed"]),
  created_at: z.string(),
  revision: z.number().int(),
  proposals: z.array(proposal),
  confirmed: z.array(z.number().int()),
  forgotten_at: z.string().nullable(),
});
const snapshotSchema = z.object({
  conversation: z
    .object({
      id: z.uuid(),
      context_revision: z.number().int(),
      context_after: z.string(),
      revision: z.number().int(),
    })
    .nullable(),
  messages: z.array(message),
  memories: z.array(
    z.object({
      id: z.uuid(),
      scope: z.enum(["personal", "brand"]),
      key: z.string(),
      value: z.string(),
      revision: z.number().int(),
      source_message_id: z.uuid().nullable(),
      updated_at: z.string(),
    }),
  ),
});
const unavailable = () =>
  new AppError("DEPENDENCY_UNAVAILABLE", "Assistant storage is unavailable.");
function checked<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw unavailable();
  return parsed.data;
}
/** Reads use the signed-in user's RLS/session. Fixed service RPCs write only after application/SQL authorization. */
export function createSupabaseAssistantRepository(settings: SupabaseSettings): AssistantRepository {
  async function read(s: AssistantScope, kind: string, args: unknown) {
    const { data, error } = await (
      await createUserClient(settings)
    ).rpc("assistant_read", {
      p_workspace: s.workspaceId,
      p_brand: s.brandId,
      p_kind: kind,
      p_args: args,
    });
    if (error) throw mapDatabaseError(error);
    return data as unknown;
  }
  async function write(s: AssistantScope, u: string, op: string, data: unknown) {
    const result = await createServiceClient(settings).rpc("assistant_mutate", {
      p_user: u,
      p_workspace: s.workspaceId,
      p_brand: s.brandId,
      p_operation: op,
      p_data: data,
    });
    if (result.error) {
      if (result.error.message?.includes("assistant_rate_limited"))
        throw new AppError(
          "RATE_LIMITED",
          "Assistant message limit reached. Try again after the current window resets.",
        );
      throw mapDatabaseError(result.error);
    }
    return result.data as unknown;
  }
  const turn = (t: AssistantTurn) => ({
    turnId: t.turnId,
    assistantMessageId: t.assistantMessageId,
  });
  async function snapshot(
    s: AssistantScope,
    u: string,
    cursor: string | null,
    limit: number,
    kind = "snapshot",
  ): Promise<AssistantSnapshot> {
    await write(s, u, "cleanup", {});
    const raw = checked(snapshotSchema, await read(s, kind, { cursor, limit })),
      more = raw.messages.length > limit,
      items = raw.messages.slice(0, limit),
      last = items.at(-1);
    return {
      conversation: raw.conversation
        ? {
            id: raw.conversation.id,
            contextRevision: raw.conversation.context_revision,
            contextAfter: raw.conversation.context_after,
            revision: raw.conversation.revision,
          }
        : null,
      messages: items.map((m) => ({
        id: m.id,
        conversationId: m.conversation_id,
        turnId: m.turn_id,
        role: m.role,
        body: m.body,
        status: m.status,
        createdAt: m.created_at,
        revision: m.revision,
        proposals: m.proposals,
        confirmed: m.confirmed,
        forgottenAt: m.forgotten_at,
      })),
      memories: raw.memories.map((m) => ({
        id: m.id,
        scope: m.scope,
        key: m.key,
        value: m.value,
        revision: m.revision,
        sourceMessageId: m.source_message_id,
        updatedAt: m.updated_at,
      })),
      memoryTruncated: false,
      nextCursor: more && last ? `${last.created_at}|${last.id}` : null,
    };
  }
  return {
    async message(s, _u, id) {
      const raw = await read(s, "message", { id });
      if (raw === null) return null;
      const m = checked(message, raw);
      return {
        id: m.id,
        conversationId: m.conversation_id,
        turnId: m.turn_id,
        role: m.role,
        body: m.body,
        status: m.status,
        createdAt: m.created_at,
        revision: m.revision,
        proposals: m.proposals,
        confirmed: m.confirmed,
        forgottenAt: m.forgotten_at,
      };
    },
    snapshot,
    exportPage: (s, u, c, l) => snapshot(s, u, c, l, "export"),
    async begin(s, u, requestId, text, leaseSeconds, retentionDays, admission) {
      const t = checked(
        z.object({
          conversation_id: z.uuid(),
          turn_id: z.uuid(),
          user_message_id: z.uuid(),
          assistant_message_id: z.uuid(),
          context_revision: z.number().int(),
          status: z.enum(["pending", "complete", "failed"]),
          replay: z.boolean(),
        }),
        await write(s, u, "begin", { requestId, text, leaseSeconds, retentionDays, admission }),
      );
      return {
        conversationId: t.conversation_id,
        turnId: t.turn_id,
        userMessageId: t.user_message_id,
        assistantMessageId: t.assistant_message_id,
        contextRevision: t.context_revision,
        status: t.status,
        replay: t.replay,
      };
    },
    async guard(s, u, t) {
      await write(s, u, "guard", turn(t));
    },
    async finish(s, u, t, text, proposals) {
      await write(s, u, "finish", { ...turn(t), text, proposals });
    },
    async fail(s, u, t) {
      await write(s, u, "fail", turn(t));
    },
    async stats(s) {
      return checked(z.record(z.string(), z.string().regex(/^\d+$/)), await read(s, "stats", {}));
    },
    async history(s, _u, query, limit) {
      return checked(
        z.array(
          z.object({ id: z.uuid(), role: z.string(), body: z.string(), created_at: z.string() }),
        ),
        await read(s, "history", { query, limit }),
      ).map((m) => ({ id: m.id, role: m.role, body: m.body, createdAt: m.created_at }));
    },
    async contentHistory(s, _u, query, limit) {
      return checked(
        z.array(
          z.object({ id: z.uuid(), title: z.string(), format: z.string(), stage: z.string() }),
        ),
        await read(s, "content_history", { query, limit }),
      );
    },
    async summary(s, u, c, ids, excerpt) {
      const v = checked(
        z.object({
          text: z.string(),
          source_ids: z.array(z.uuid()),
          context_revision: z.number().int(),
        }),
        await write(s, u, "summary", { contextRevision: c.contextRevision, ids, excerpt }),
      );
      return { text: v.text, sourceIds: v.source_ids, contextRevision: v.context_revision };
    },
    async memory(s, u, input) {
      await write(s, u, "memory", input);
    },
    async confirm(s, u, messageId, index, settings, revision) {
      await write(s, u, "confirm", { messageId, index, settings, revision });
    },
    async forget(s, u, messageId, revision) {
      await write(s, u, "forget", { messageId, revision });
    },
  };
}
