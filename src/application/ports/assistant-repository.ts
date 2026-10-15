export interface AssistantScope {
  workspaceId: string;
  brandId: string;
}
export interface AssistantMessage {
  id: string;
  conversationId: string;
  turnId: string;
  role: "user" | "assistant";
  body: string | null;
  status: "pending" | "complete" | "failed";
  createdAt: string;
  revision: number;
  proposals: AssistantProposal[];
  confirmed: number[];
  forgottenAt: string | null;
}
export interface AssistantProposal {
  kind: "memory" | "preference";
  scope?: "personal" | "brand";
  key?: string;
  value: string;
  field?: string;
  before?: unknown;
}
export interface AssistantMemory {
  id: string;
  scope: "personal" | "brand";
  key: string;
  value: string;
  revision: number;
  sourceMessageId: string | null;
  updatedAt: string;
}
export interface AssistantConversation {
  id: string;
  contextRevision: number;
  contextAfter: string;
  revision: number;
}
export interface AssistantSnapshot {
  conversation: AssistantConversation | null;
  messages: AssistantMessage[];
  memories: AssistantMemory[];
  nextCursor: string | null;
  memoryTruncated: boolean;
}
export interface AssistantTurn {
  conversationId: string;
  turnId: string;
  userMessageId: string;
  assistantMessageId: string;
  contextRevision: number;
  status: "pending" | "complete" | "failed";
  replay: boolean;
}
export interface AssistantSummary {
  text: string;
  sourceIds: string[];
  contextRevision: number;
}
export interface AssistantHistory {
  id: string;
  role: string;
  body: string;
  createdAt: string;
}
export type AssistantStats = Record<string, string>;
/** Every operation binds the signed-in user and explicit workspace/brand. No shared tenant cache. */
export interface AssistantRepository {
  message(scope: AssistantScope, userId: string, id: string): Promise<AssistantMessage | null>;
  snapshot(
    scope: AssistantScope,
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<AssistantSnapshot>;
  begin(
    scope: AssistantScope,
    userId: string,
    requestId: string,
    text: string,
    leaseSeconds: number,
    retentionDays: number,
    admission: { minute: number; day: number },
  ): Promise<AssistantTurn>;
  guard(scope: AssistantScope, userId: string, turn: AssistantTurn): Promise<void>;
  finish(
    scope: AssistantScope,
    userId: string,
    turn: AssistantTurn,
    text: string,
    proposals: AssistantProposal[],
  ): Promise<void>;
  fail(scope: AssistantScope, userId: string, turn: AssistantTurn): Promise<void>;
  stats(scope: AssistantScope, userId: string): Promise<AssistantStats>;
  history(
    scope: AssistantScope,
    userId: string,
    query: string,
    limit: number,
  ): Promise<AssistantHistory[]>;
  contentHistory(
    scope: AssistantScope,
    userId: string,
    query: string,
    limit: number,
  ): Promise<Array<{ id: string; title: string; format: string; stage: string }>>;
  summary(
    scope: AssistantScope,
    userId: string,
    conversation: AssistantConversation,
    ids: string[],
    excerpt: number,
  ): Promise<AssistantSummary>;
  memory(
    scope: AssistantScope,
    userId: string,
    input: {
      id: string | null;
      revision: number;
      scope: "personal" | "brand";
      key: string;
      value: string;
      forget: boolean;
    },
  ): Promise<void>;
  confirm(
    scope: AssistantScope,
    userId: string,
    messageId: string,
    index: number,
    settings: unknown,
    revision: number,
  ): Promise<void>;
  forget(
    scope: AssistantScope,
    userId: string,
    messageId: string | null,
    revision: number,
  ): Promise<void>;
  exportPage(
    scope: AssistantScope,
    userId: string,
    cursor: string | null,
    limit: number,
  ): Promise<AssistantSnapshot>;
}
