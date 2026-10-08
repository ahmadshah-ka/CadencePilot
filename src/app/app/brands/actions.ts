"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createBrand, updateBrand } from "@/application/workspaces/workspace-use-cases";
import { AppError, isAppError } from "@/domain/errors/app-error";
import { getContainer } from "@/infrastructure/composition";
import { getPrincipal, SIGN_IN_PATH } from "@/presentation/auth/page-guards";
import { getOwnWorkspace, getWorkspaceDeps } from "@/presentation/workspaces/workspace-context";

const HOME = "/app/brands";

function outcome(error: unknown): string {
  if (!isAppError(error)) return "error";
  if (error.code === "UNAUTHENTICATED") redirect(SIGN_IN_PATH);
  if (error.code === "INVALID_REQUEST") return "invalid";
  if (error.code === "CONFLICT")
    return typeof error.details?.reason === "string" ? error.details.reason : "conflict";
  return "error";
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
    getContainer().logger.warn("brand creation failed", { result, error });
  }
  revalidatePath("/app", "layout");
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
      result = isAppError(error) && error.code === "CONFLICT" ? "stale" : outcome(error);
      getContainer().logger.warn("brand update failed", { result, error });
    }
  }
  revalidatePath("/app", "layout");
  redirect(`${HOME}?result=${result}`);
}
