"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createBrand,
  ensureWorkspace,
  updateBrand,
} from "@/application/workspaces/workspace-use-cases";
import { AppError } from "@/domain/errors/app-error";
import { getContainer } from "@/infrastructure/composition";
import { getPrincipal, SIGN_IN_PATH } from "@/presentation/auth/page-guards";
import { getOwnWorkspace, getWorkspaceDeps } from "@/presentation/workspaces/workspace-context";

const HOME = "/app";

function outcome(error: unknown): string {
  if (!(error instanceof AppError)) return "error";
  if (error.code === "UNAUTHENTICATED") redirect(SIGN_IN_PATH);
  if (error.code === "INVALID_REQUEST") return "invalid";
  if (error.code === "CONFLICT")
    return typeof error.details?.reason === "string" ? error.details.reason : "conflict";
  return "error";
}

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
    result = outcome(error);
    getContainer().logger.warn("workspace creation failed", { result });
  }
  revalidatePath(HOME);
  redirect(`${HOME}?result=${result}`);
}

/** Server action: creates a brand in the caller's own workspace, resolved server-side. */
export async function createBrandAction(formData: FormData): Promise<void> {
  let result = "brand-created";
  try {
    const principal = await getPrincipal();
    if (!principal) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const workspace = await getOwnWorkspace(principal);
    if (!workspace) throw new AppError("NOT_FOUND", "Not found.");
    await createBrand(getWorkspaceDeps(), principal, workspace.id, {
      name: String(formData.get("name") ?? ""),
    });
  } catch (error) {
    result = outcome(error);
    getContainer().logger.warn("brand creation failed", { result });
  }
  revalidatePath(HOME);
  redirect(`${HOME}?result=${result}`);
}

const archiveSchema = z.object({
  brandId: z.uuid(),
  expectedRevision: z.coerce.number().int().positive(),
  archived: z.enum(["true", "false"]),
});

/** Server action: archives or restores one of the caller's brands (never deletes). */
export async function archiveBrandAction(formData: FormData): Promise<void> {
  const parsed = archiveSchema.safeParse(Object.fromEntries(formData));
  let result = "brand-updated";
  if (!parsed.success) {
    result = "invalid";
  } else {
    try {
      const principal = await getPrincipal();
      if (!principal) throw new AppError("UNAUTHENTICATED", "Sign in required.");
      const workspace = await getOwnWorkspace(principal);
      if (!workspace) throw new AppError("NOT_FOUND", "Not found.");
      await updateBrand(getWorkspaceDeps(), principal, workspace.id, parsed.data.brandId, {
        expectedRevision: parsed.data.expectedRevision,
        archived: parsed.data.archived === "true",
      });
    } catch (error) {
      result = error instanceof AppError && error.code === "CONFLICT" ? "stale" : outcome(error);
      getContainer().logger.warn("brand update failed", { result });
    }
  }
  revalidatePath(HOME);
  redirect(`${HOME}?result=${result}`);
}
