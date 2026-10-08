import "server-only";
import {
  getCurrentWorkspace,
  type WorkspaceDeps,
} from "@/application/workspaces/workspace-use-cases";
import type { Principal } from "@/domain/access/access-policy";
import type { WorkspaceRecord } from "@/application/ports/workspace-repository";
import { getContainer } from "@/infrastructure/composition";
import { getAppConfig } from "@/presentation/auth/page-guards";

/** Use-case dependencies for pages and server actions. */
export function getWorkspaceDeps(): WorkspaceDeps {
  const container = getContainer();
  return {
    workspaces: container.workspaces,
    logger: container.logger,
    limits: getAppConfig().limits,
  };
}

/**
 * The caller's workspace derived on the server from their session. Pages and actions use this
 * instead of any workspace id supplied by the browser.
 */
export async function getOwnWorkspace(principal: Principal): Promise<WorkspaceRecord | null> {
  return getCurrentWorkspace(getWorkspaceDeps(), principal);
}
