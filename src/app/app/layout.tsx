import type { ReactNode } from "react";
import { AppShell } from "@/presentation/components/shell/app-shell";
import { SkipLink } from "@/presentation/components/ui/skip-link";
import { requireApprovedPage } from "@/presentation/auth/page-guards";
import { getProductName } from "@/presentation/site/product-name";
import { getShellScope } from "@/presentation/workspaces/shell-scope";

export const dynamic = "force-dynamic";

/**
 * Access policy: approved. Every page under /app renders inside this shell only after the server
 * confirms an approved account; pending, rejected and suspended users are redirected before any
 * product data is read. Pages are never cached (private, no-store).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const principal = await requireApprovedPage("/app");
  const scope = await getShellScope();
  return (
    <>
      <SkipLink />
      <AppShell productName={getProductName()} scope={scope} isOwner={principal.isOwner}>
        {children}
      </AppShell>
    </>
  );
}
