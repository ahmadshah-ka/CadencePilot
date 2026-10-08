"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureWorkspace } from "@/application/workspaces/workspace-use-cases";
import { isAppError } from "@/domain/errors/app-error";
import { getContainer } from "@/infrastructure/composition";
import { getPrincipal, SIGN_IN_PATH } from "@/presentation/auth/page-guards";
import { getWorkspaceDeps } from "@/presentation/workspaces/workspace-context";

/** Server action: creates the caller's workspace (idempotent). Any workspace id in the form is ignored. */
export async function createWorkspaceAction(formData: FormData): Promise<void> {
  let result = "workspace-created";
  try {
    await ensureWorkspace(
      getWorkspaceDeps(),
      await getPrincipal(),
      String(formData.get("name") ?? ""),
    );
  } catch (error) {
    if (isAppError(error) && error.code === "UNAUTHENTICATED") redirect(SIGN_IN_PATH);
    result = isAppError(error) && error.code === "INVALID_REQUEST" ? "invalid" : "error";
    getContainer().logger.warn("workspace creation failed", { result, error });
  }
  revalidatePath("/app", "layout");
  redirect(`/app?result=${result}`);
}
