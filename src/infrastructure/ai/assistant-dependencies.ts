import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { assistantPolicy } from "@/config/assistant-policy";
import onboarding from "@/config/onboarding-policy.json";
import type { AssistantDeps } from "@/application/assistant/assistant-use-cases";
import type { Container } from "@/infrastructure/composition";
import { AppError } from "@/domain/errors/app-error";
import { createAiDeps } from "./ai-dependencies";
import { createSupabaseAssistantRepository } from "@/infrastructure/supabase/supabase-assistant-repository";
const FILES = { tools: "brand-assistant-tools-v1.txt", answer: "brand-assistant-answer-v1.txt" };
/** No AI provider call occurs when reading/editing memory or using the manual fallback. */
export function createAssistantDeps(c: Container): AssistantDeps {
  if (!c.config.ok) throw new AppError("DEPENDENCY_UNAVAILABLE", "Assistant unavailable.");
  const config = c.config.config;
  return {
    repository: createSupabaseAssistantRepository({
      ...config.supabase,
      secureCookies: config.app.env !== "development",
    }),
    preferences: c.preferences,
    workspace: { workspaces: c.workspaces, logger: c.logger, limits: config.limits },
    onboarding,
    policy: {
      ...assistantPolicy,
      retentionDays: Math.min(config.env.AI_RETENTION_DAYS ?? assistantPolicy.retentionDays, 3650),
    },
    ai: () => createAiDeps(c),
    prompt: (phase) => readFile(join(process.cwd(), "prompts", FILES[phase]), "utf8"),
    newId: randomUUID,
    now: () => c.clock.now().getTime(),
  };
}
