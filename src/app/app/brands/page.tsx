import Link from "next/link";
import { listBrands } from "@/application/workspaces/workspace-use-cases";
import { buttonClasses } from "@/presentation/components/ui/button";
import { Notice, PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";
import { getAppConfig, getPrincipal } from "@/presentation/auth/page-guards";
import { getShellScope } from "@/presentation/workspaces/shell-scope";
import { getWorkspaceDeps } from "@/presentation/workspaces/workspace-context";
import { archiveBrandAction, createBrandAction } from "./actions";

export const dynamic = "force-dynamic";

const RESULTS: Record<string, string> = {
  "brand-created": "Brand added.",
  "brand-updated": "Brand updated.",
  invalid: "That input was not valid. Check the name and try again.",
  duplicate: "A brand with that name already exists.",
  brand_limit: "This workspace has reached its brand limit.",
  stale: "That brand changed since you loaded it. Reload and try again.",
  error: "Something went wrong. Nothing was changed.",
};

/** Access policy: approved + membership of the caller's workspace (resolved server-side). */
export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const { result } = await searchParams;
  const scope = await getShellScope();
  const message = result ? RESULTS[result] : undefined;
  const config = getAppConfig();

  if (!scope.workspace) {
    return (
      <div className="space-y-8">
        <PageHeader title="Brands" />
        <StateMessage
          tone="empty"
          title="Create your workspace first"
          action={
            <Link href="/app" className={buttonClasses("primary")}>
              Go to setup
            </Link>
          }
        >
          Brands live inside your private workspace.
        </StateMessage>
      </div>
    );
  }

  const principal = await getPrincipal();
  const page = await listBrands(getWorkspaceDeps(), principal, scope.workspace.id, {
    includeArchived: true,
    cursor: null,
    limit: config.limits.listPageSize,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Brands"
        description="Each brand keeps its own audience, goals and history."
      />
      {message ? <Notice>{message}</Notice> : null}

      {page.items.length === 0 ? (
        <StateMessage tone="empty" title="No brands yet">
          Add your first brand below. You can use any name; audiences and goals come later in
          onboarding.
        </StateMessage>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {page.items.map((brand) => (
            <li key={brand.id} className="flex items-center justify-between gap-3 py-3">
              <span className={brand.archivedAt ? "text-muted line-through" : ""}>
                {brand.name}
                {brand.archivedAt ? <span className="sr-only"> (archived)</span> : null}
              </span>
              <form action={archiveBrandAction}>
                <input type="hidden" name="brandId" value={brand.id} />
                <input type="hidden" name="expectedRevision" value={brand.revision} />
                <input type="hidden" name="archived" value={brand.archivedAt ? "false" : "true"} />
                <button type="submit" className={buttonClasses("secondary")}>
                  {brand.archivedAt ? "Restore" : "Archive"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {page.nextCursor ? (
        <p className="text-sm text-muted">Showing the first {page.items.length} brands.</p>
      ) : null}

      <form action={createBrandAction} className="flex max-w-lg flex-wrap items-end gap-3">
        <label className="block flex-1">
          <span className="block text-sm">New brand name</span>
          <input
            name="name"
            required
            maxLength={config.limits.brandNameMaxLength}
            className="mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3"
          />
        </label>
        <button type="submit" className={buttonClasses("primary")}>
          Add brand
        </button>
      </form>
    </div>
  );
}
