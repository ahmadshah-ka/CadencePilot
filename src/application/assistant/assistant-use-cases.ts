import { z } from "zod";
import { AppError, isAppError } from "@/domain/errors/app-error";
import type { Principal } from "@/domain/access/access-policy";
import type {
  AssistantRepository,
  AssistantScope,
  AssistantProposal,
  AssistantStats,
} from "@/application/ports/assistant-repository";
import type { PreferenceRepository } from "@/application/ports/preference-repository";
import {
  authorizeWorkspace,
  type WorkspaceDeps,
} from "@/application/workspaces/workspace-use-cases";
import { runAi, type AiDeps } from "@/application/ai/run-ai";
import type { AiMessage, AiTool } from "@/application/ports/ai-provider";
import { inputTokenBound } from "@/domain/ai/ai-rules";
import {
  memoryProposalSchema,
  preferenceProposalSchema,
  PREFERENCE_FIELDS,
  missingPreferences,
  renderVerifiedAnswer,
  provisionalAnswer,
} from "@/domain/assistant/assistant-rules";
import {
  preferenceSchemas,
  type OnboardingPolicy,
  type BrandPreferences,
  type PersonalPreferences,
} from "@/domain/preferences/preference-rules";
export interface AssistantPolicy {
  turnsPerMinute: number;
  turnsPerDay: number;
  messageMaxLength: number;
  answerMaxLength: number;
  memoryValueMaxLength: number;
  memoryKeyMaxLength: number;
  pageSize: number;
  historyLimit: number;
  memoryLimit: number;
  searchLimit: number;
  searchQueryMaxLength: number;
  proposalLimit: number;
  summaryExcerptLength: number;
  summaryMaxLength: number;
  retentionDays: number;
  turnLeaseSeconds: number;
  streamBatchMs: number;
  comparisonBrandLimit: number;
}
export interface AssistantDeps {
  repository: AssistantRepository;
  preferences: PreferenceRepository;
  workspace: WorkspaceDeps;
  onboarding: OnboardingPolicy;
  policy: AssistantPolicy;
  ai: () => AiDeps;
  prompt: (phase: "tools" | "answer") => Promise<string>;
  newId: () => string;
  now: () => number;
}
export type AssistantEvent = (type: "status" | "delta" | "done", data: unknown) => Promise<void>;
const scopeSchema = z.object({ workspaceId: z.uuid(), brandId: z.uuid() });
const invalid = () => new AppError("INVALID_REQUEST", "Check the assistant fields and try again.");
/** No owner bypass: fresh principal, membership and actual brand scope are required before repository calls. */
export async function authorizeAssistant(
  d: AssistantDeps,
  p: Principal | null,
  s: AssistantScope,
  active = false,
) {
  if (!scopeSchema.safeParse(s).success) throw new AppError("NOT_FOUND", "Not found.");
  const user = await authorizeWorkspace(d.workspace, p, s.workspaceId),
    brand = await d.workspace.workspaces.getBrand(s.workspaceId, s.brandId);
  if (!brand || brand.workspaceId !== s.workspaceId) throw new AppError("NOT_FOUND", "Not found.");
  if (active && brand.archivedAt)
    throw new AppError("CONFLICT", "Restore this brand before using the assistant.");
  return { user, brand };
}
function parsed<T>(schema: z.ZodType<T>, value: unknown): T {
  const p = schema.safeParse(value);
  if (!p.success) throw invalid();
  return p.data;
}
/** Reuses feature-05's full validation and preserves week-only overrides and unrelated brand JSON. */
export async function assistantSettings(d: AssistantDeps, p: Principal | null, s: AssistantScope) {
  const { user, brand } = await authorizeAssistant(d, p, s);
  const raw = brand.profile.onboarding as Record<string, unknown> | undefined;
  const brandPrefs = parsed(preferenceSchemas(d.onboarding).brand, {
    topic: "",
    audience: "",
    tone: "",
    platforms: [],
    ...raw,
    targets: brand.targets.onboarding ?? {},
    weeklyTargets: brand.targets.weeklyOverrides ?? [],
  });
  const personal = await d.preferences.get(user.userId),
    personalPrefs = personal?.settings ?? {
      timezone: "",
      availability: [],
      weeklyAvailability: [],
    };
  return {
    brand,
    brandPrefs,
    personal,
    personalPrefs,
    missing: missingPreferences(
      brandPrefs as unknown as Record<string, unknown>,
      personal ? (personalPrefs as unknown as Record<string, unknown>) : {},
    ),
  };
}
/** Bounded, noncached per-user/per-brand state; exports use the same scope checks and cursor contracts. */
export async function assistantState(
  d: AssistantDeps,
  p: Principal | null,
  s: AssistantScope,
  cursor: string | null = null,
  exporting = false,
) {
  const { user } = await authorizeAssistant(d, p, s);
  if (cursor) {
    const [date, id, ...rest] = cursor.split("|");
    if (
      rest.length ||
      !z.uuid().safeParse(id).success ||
      !date ||
      !Number.isFinite(Date.parse(date))
    )
      throw invalid();
  }
  const snapshot = await (exporting ? d.repository.exportPage : d.repository.snapshot)(
    s,
    user.userId,
    cursor,
    d.policy.pageSize,
  );
  const settings = await assistantSettings(d, p, s),
    stats = await d.repository.stats(s, user.userId);
  return {
    ...snapshot,
    settings: { brand: settings.brandPrefs, personal: settings.personalPrefs },
    missing: settings.missing,
    stats,
    retentionDays: d.policy.retentionDays,
  };
}
function fieldValue(
  brand: BrandPreferences,
  personal: PersonalPreferences,
  field: string,
): unknown {
  if (field === "timezone" || field === "availability") return personal[field];
  if (field.startsWith("targets.")) return brand.targets[field.slice("targets.".length)] ?? null;
  return brand[field as keyof BrandPreferences] ?? null;
}
function changePreference(
  d: AssistantDeps,
  b: BrandPreferences,
  p: PersonalPreferences,
  field: string,
  value: string,
) {
  let v: unknown = value;
  if (field === "platforms" || field === "availability" || field.startsWith("targets.")) {
    try {
      v = JSON.parse(value);
    } catch {
      throw invalid();
    }
  }
  if (field === "timezone" || field === "availability")
    return {
      kind: "personal" as const,
      settings: parsed(preferenceSchemas(d.onboarding).personal, { ...p, [field]: v }),
    };
  const changed = field.startsWith("targets.")
    ? { ...b, targets: { ...b.targets, [field.slice("targets.".length)]: v } }
    : { ...b, [field]: v };
  return {
    kind: "brand" as const,
    settings: parsed(preferenceSchemas(d.onboarding).brand, changed),
  };
}
/** Only these fixed names/JSON contracts are offered. IDs and limits are always server-bound. */
export function assistantTools(mode: "chat" | "onboarding", policy: AssistantPolicy): AiTool[] {
  const object = { type: "object", properties: {}, additionalProperties: false };
  const read: AiTool[] = [
    {
      name: "brand_stats",
      description: "Read exact current counts.",
      parameters: object,
      validate: z.object({}).strict(),
    },
    {
      name: "content_history",
      description: "Find selected-brand content titles.",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
        additionalProperties: false,
      },
      validate: z.object({ query: z.string().max(policy.searchQueryMaxLength) }).strict(),
    },
    {
      name: "current_settings",
      description: "Read current confirmed settings.",
      parameters: object,
      validate: z.object({}).strict(),
    },
  ];
  const memory: AiTool = {
    name: "propose_memory",
    description: "Propose a lasting user-stated fact for confirmation.",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["personal", "brand"] },
        key: { type: "string" },
        value: { type: "string" },
      },
      required: ["scope", "key", "value"],
      additionalProperties: false,
    },
    validate: memoryProposalSchema,
  };
  const preference: AiTool = {
    name: "propose_preference",
    description:
      "Propose one setting for confirmation; value is text, or JSON for arrays/numeric targets.",
    parameters: {
      type: "object",
      properties: {
        field: { type: "string", enum: [...PREFERENCE_FIELDS] },
        value: { type: "string" },
      },
      required: ["field", "value"],
      additionalProperties: false,
    },
    validate: preferenceProposalSchema,
  };
  return mode === "onboarding" ? [read[2]!, preference, memory] : [...read, memory];
}
/** Mandatory current input is never truncated. Optional context is admitted one block at a time. */
export function assistantContext(
  ai: AiDeps,
  prompt: string,
  question: string,
  mandatory: unknown,
  optional: unknown[],
  tools: AiTool[] = [],
): AiMessage[] {
  const messages: AiMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify({ verifiedContext: mandatory }) },
    { role: "user", content: question },
  ];
  const fits = (m: AiMessage[]) =>
    inputTokenBound(m, tools, undefined, ai.policy.overheadTokens) <= ai.policy.contextTokens;
  if (!fits(messages))
    throw new AppError(
      "INVALID_REQUEST",
      "This message and the required context exceed the configured AI budget. Shorten the message or adjust the context budget.",
    );
  for (const item of optional) {
    const block: AiMessage = { role: "user", content: JSON.stringify({ untrustedContext: item }) },
      candidate = [...messages.slice(0, -1), block, messages.at(-1)!];
    if (fits(candidate)) messages.splice(messages.length - 1, 0, block);
  }
  return messages;
}
/** Two bounded phases: allowlisted read/proposal tools, then interactive text. No implicit persistence of proposals. */
export async function runAssistant(
  d: AssistantDeps,
  p: Principal | null,
  s: AssistantScope,
  input: unknown,
  traceId: string,
  signal: AbortSignal,
  emit: AssistantEvent,
) {
  const request = parsed(
    z
      .object({
        requestId: z.uuid(),
        text: z.string().trim().min(1).max(d.policy.messageMaxLength),
        mode: z.enum(["chat", "onboarding"]),
        compareBrandIds: z.array(z.uuid()).max(d.policy.comparisonBrandLimit).default([]),
      })
      .strict(),
    input,
  );
  const { user } = await authorizeAssistant(d, p, s, true),
    ai = d.ai();
  const comparisons = [...new Set(request.compareBrandIds)].filter((id) => id !== s.brandId);
  for (const id of comparisons) await authorizeAssistant(d, p, { ...s, brandId: id }, true);
  const t = await d.repository.begin(
    s,
    user.userId,
    request.requestId,
    request.text,
    d.policy.turnLeaseSeconds,
    d.policy.retentionDays,
    { minute: d.policy.turnsPerMinute, day: d.policy.turnsPerDay },
  );
  if (t.replay) {
    await emit("done", { replay: true, status: t.status });
    return;
  }
  try {
    await emit("status", { message: "Reading your brand records…" });
    const snapshot = await d.repository.snapshot(s, user.userId, null, d.policy.pageSize),
      settings = await assistantSettings(d, p, s),
      stats = await d.repository.stats(s, user.userId);
    const facts: AssistantStats = { ...stats };
    for (const [format, value] of Object.entries(settings.brandPrefs.targets))
      if (value !== undefined) facts[`target_${format}`] = String(value);
    const comparisonLabels: Array<{ name: string; prefix: string }> = [];
    const LETTERS = ["a", "b", "c", "d", "e"];
    for (const [index, id] of comparisons.entries()) {
      const scope = { ...s, brandId: id },
        { brand } = await authorizeAssistant(d, p, scope, true),
        other = await d.repository.stats(scope, user.userId),
        prefix = `compare_${LETTERS[index]}_`;
      comparisonLabels.push({ name: brand.name, prefix });
      for (const [key, value] of Object.entries(other)) facts[`${prefix}${key}`] = value;
    }
    const proposals: AssistantProposal[] = [],
      toolResults: unknown[] = [];
    const tools = assistantTools(request.mode, d.policy);
    const guardAuthorizedScopes = async () => {
      await d.repository.guard(s, user.userId, t);
      for (const id of comparisons) await authorizeAssistant(d, p, { ...s, brandId: id }, true);
    };
    const first = await runAi(ai, p, {
      ...s,
      requestId: d.newId(),
      traceId,
      promptVersion: "brand-assistant-tools-v1",
      messages: assistantContext(
        ai,
        await d.prompt("tools"),
        request.text,
        { brand: settings.brand.name, missing: settings.missing },
        [],
        tools,
      ),
      tools,
      signal,
    });
    for (const call of first.toolCalls) {
      await guardAuthorizedScopes();
      if (call.name === "brand_stats") toolResults.push({ kind: "stats", value: stats });
      else if (call.name === "current_settings")
        toolResults.push({
          kind: "settings",
          brand: settings.brandPrefs,
          personal: settings.personalPrefs,
        });
      else if (call.name === "content_history") {
        const q = parsed(
          z.object({ query: z.string().max(d.policy.searchQueryMaxLength) }).strict(),
          call.arguments,
        );
        toolResults.push({
          kind: "content",
          records: await d.repository.contentHistory(s, user.userId, q.query, d.policy.searchLimit),
        });
      } else if (call.name === "propose_memory") {
        const m = parsed(memoryProposalSchema, call.arguments);
        if (
          m.value.length > d.policy.memoryValueMaxLength ||
          m.key.length > d.policy.memoryKeyMaxLength
        )
          throw invalid();
        proposals.push({ kind: "memory", ...m });
      } else if (call.name === "propose_preference" && request.mode === "onboarding") {
        const proposal = parsed(preferenceProposalSchema, call.arguments);
        changePreference(
          d,
          settings.brandPrefs,
          settings.personalPrefs,
          proposal.field,
          proposal.value,
        );
        if (proposals.some((p) => p.field === proposal.field)) throw invalid();
        proposals.push({
          kind: "preference",
          ...proposal,
          before: fieldValue(settings.brandPrefs, settings.personalPrefs, proposal.field),
        });
      } else throw invalid();
      if (proposals.length > d.policy.proposalLimit) throw invalid();
    }
    const recent = await d.repository.history(s, user.userId, "", d.policy.historyLimit),
      relevant = await d.repository.history(
        s,
        user.userId,
        request.text.slice(0, d.policy.searchQueryMaxLength),
        d.policy.searchLimit,
      );
    const sources = [...new Map([...relevant, ...recent].map((m) => [m.id, m])).values()].slice(
      0,
      d.policy.historyLimit,
    );
    const conversation = snapshot.conversation;
    const summary = conversation
      ? await d.repository.summary(
          s,
          user.userId,
          conversation,
          sources.map((m) => m.id),
          d.policy.summaryExcerptLength,
        )
      : null;
    const messages = assistantContext(
      ai,
      await d.prompt("answer"),
      request.text,
      {
        brand: settings.brand.name,
        facts,
        comparisonLabels,
        settings: { brand: settings.brandPrefs, personal: settings.personalPrefs },
        missing: settings.missing,
        proposals,
      },
      [
        { confirmedMemories: snapshot.memories.slice(0, d.policy.memoryLimit) },
        {
          summary: summary
            ? {
                text: summary.text.slice(0, d.policy.summaryMaxLength),
                sourceIds: summary.sourceIds,
              }
            : null,
        },
        ...toolResults,
      ],
    );
    let text = "",
      last = 0;
    await emit("status", { message: "Preparing a response from your records…" });
    const final = await runAi(
      ai,
      p,
      {
        ...s,
        requestId: d.newId(),
        traceId,
        promptVersion: "brand-assistant-answer-v1",
        messages,
        stream: true,
        signal,
      },
      async (delta) => {
        signal.throwIfAborted();
        text += delta;
        if (text.length > d.policy.answerMaxLength) throw invalid();
        if (d.now() - last >= d.policy.streamBatchMs) {
          await guardAuthorizedScopes();
          last = d.now();
          await emit("delta", { text: provisionalAnswer(text, facts) });
        }
      },
    );
    signal.throwIfAborted();
    await guardAuthorizedScopes();
    const answer = renderVerifiedAnswer(final.text, facts, d.policy.answerMaxLength);
    await d.repository.finish(s, user.userId, t, answer, proposals);
    await emit("done", { text: answer, proposals, stats, comparisonLabels, turnId: t.turnId });
  } catch (error) {
    try {
      await d.repository.fail(s, user.userId, t);
    } catch {
      d.workspace.logger.warn("assistant failure state unavailable", { traceId, turnId: t.turnId });
    }
    if (isAppError(error)) throw error;
    throw new AppError(
      "DEPENDENCY_UNAVAILABLE",
      "The assistant could not finish. Your message is retained; no partial answer or proposed setting was saved.",
    );
  }
}
/** Memory edits and forget operations invalidate every affected summary and context revision. */
export async function assistantCommand(
  d: AssistantDeps,
  p: Principal | null,
  s: AssistantScope,
  input: unknown,
) {
  const { user } = await authorizeAssistant(d, p, s),
    body = parsed(
      z
        .object({
          action: z.enum(["memory", "confirm", "forget-message", "forget-conversation"]),
          input: z.unknown(),
        })
        .strict(),
      input,
    );
  if (body.action === "memory") {
    const v = parsed(
      z
        .object({
          id: z.uuid().nullable(),
          revision: z.number().int().min(0),
          scope: z.enum(["personal", "brand"]),
          key: z
            .string()
            .regex(/^[a-z][a-z0-9_-]*$/)
            .max(d.policy.memoryKeyMaxLength),
          value: z.string().trim().min(1).max(d.policy.memoryValueMaxLength),
          forget: z.boolean(),
        })
        .strict(),
      body.input,
    );
    await d.repository.memory(s, user.userId, v);
    return;
  }
  if (body.action === "confirm") {
    const v = parsed(
        z
          .object({
            messageId: z.uuid(),
            index: z
              .number()
              .int()
              .min(0)
              .max(d.policy.proposalLimit - 1),
          })
          .strict(),
        body.input,
      ),
      m = await d.repository.message(s, user.userId, v.messageId),
      proposal = m?.proposals[v.index];
    if (!m || m.status !== "complete" || m.forgottenAt || !proposal)
      throw new AppError("NOT_FOUND", "Not found.");
    if (m.confirmed.includes(v.index)) return;
    let settings: unknown = null,
      revision = 0;
    if (proposal.kind === "preference") {
      const current = await assistantSettings(d, p, s),
        field = parsed(z.enum(PREFERENCE_FIELDS), proposal.field);
      if (
        JSON.stringify(fieldValue(current.brandPrefs, current.personalPrefs, field)) !==
        JSON.stringify(proposal.before)
      )
        throw new AppError(
          "CONFLICT",
          "That setting changed after this proposal. Ask for a new suggestion or use the settings form.",
        );
      const changed = changePreference(
        d,
        current.brandPrefs,
        current.personalPrefs,
        field,
        proposal.value,
      );
      settings = changed.settings;
      revision =
        changed.kind === "personal" ? (current.personal?.revision ?? 0) : current.brand.revision;
    } else {
      const memory = parsed(memoryProposalSchema, {
        scope: proposal.scope,
        key: proposal.key,
        value: proposal.value,
      });
      if (
        memory.key.length > d.policy.memoryKeyMaxLength ||
        memory.value.length > d.policy.memoryValueMaxLength
      )
        throw invalid();
    }
    await d.repository.confirm(s, user.userId, m.id, v.index, settings, revision);
    return;
  }
  const v = parsed(
    z
      .object({
        id: z.uuid().nullable(),
        revision: z.number().int().positive(),
        confirmed: z.literal(true),
      })
      .strict(),
    body.input,
  );
  if (
    (body.action === "forget-message" && !v.id) ||
    (body.action === "forget-conversation" && v.id)
  )
    throw invalid();
  await d.repository.forget(s, user.userId, v.id, v.revision);
}
