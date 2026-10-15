import type { AiUsage } from "./ai-provider";
export interface AiScope {
  workspaceId: string;
  brandId: string;
  userId: string;
}
export interface AiCaps {
  globalDailyTokens: number;
  workspaceDailyTokens: number;
  globalDailyRequests: number;
  workspaceDailyRequests: number;
  tokensPerMinute: number;
  requestsPerMinute: number;
  workspaceRequestsPerMinute: number;
}
export interface AiReservation extends AiScope {
  id: string;
  tokens: number;
  traceId: string;
  provider: string;
  model: string;
  promptVersion: string;
}
export interface AiSettlement {
  id: string;
  usage: AiUsage | null;
  status: "success" | "failed" | "unknown";
  latencyMs: number;
  estimatedCost: number | null;
}
/** Persistent admission must be atomic across every server instance; no in-memory quota fallback. */
export interface AiBudget {
  reserve(reservation: AiReservation, caps: AiCaps): Promise<boolean>;
  settle(settlement: AiSettlement): Promise<void>;
}
