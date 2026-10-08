import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";
import { listBrands } from "@/application/workspaces/workspace-use-cases";
import type { BrandRecord, WorkspaceRecord } from "@/application/ports/workspace-repository";
import { getAppConfig, requireApprovedPage } from "@/presentation/auth/page-guards";
import { getOwnWorkspace, getWorkspaceDeps } from "./workspace-context";

/** Remembers which brand the user is viewing. Only a hint: it is re-validated on every request. */
export const BRAND_SCOPE_COOKIE = "cp_brand";
export const ALL_BRANDS = "all";

export interface ShellScope {
  workspace: WorkspaceRecord | null;
  brands: BrandRecord[];
  /** null means "all brands". Always one of `brands`, never a client-supplied id. */
  selectedBrand: BrandRecord | null;
}

const brandIdSchema = z.uuid();

/**
 * Resolves (once per request) what the signed-in user may currently see. The brand cookie is matched against the
 * brands this principal is authorized to list; a forged or stale id simply falls back to "all".
 */
export const getShellScope = cache(async (): Promise<ShellScope> => {
  const principal = await requireApprovedPage("/app");
  const workspace = await getOwnWorkspace(principal);
  if (!workspace) return { workspace: null, brands: [], selectedBrand: null };

  const page = await listBrands(getWorkspaceDeps(), principal, workspace.id, {
    includeArchived: false,
    cursor: null,
    limit: getAppConfig().limits.listPageSize,
  });
  const requested = (await cookies()).get(BRAND_SCOPE_COOKIE)?.value;
  const valid = brandIdSchema.safeParse(requested);
  const selectedBrand = valid.success
    ? (page.items.find((b) => b.id === valid.data) ?? null)
    : null;
  return { workspace, brands: page.items, selectedBrand };
});
