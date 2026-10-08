import Link from "next/link";
import { signOutAction } from "@/app/actions/auth-actions";
import { listBrands } from "@/application/workspaces/workspace-use-cases";
import { getAppConfig, requireApprovedPage } from "@/presentation/auth/page-guards";
import { getOwnWorkspace, getWorkspaceDeps } from "@/presentation/workspaces/workspace-context";
import { archiveBrandAction, createBrandAction, createWorkspaceAction } from "./actions";

export const dynamic = "force-dynamic";

const RESULTS: Record<string, string> = {
  "workspace-created": "Workspace ready.",
  "brand-created": "Brand added.",
  "brand-updated": "Brand updated.",
  invalid: "That input was not valid. Check the name and try again.",
  duplicate: "A brand with that name already exists.",
  brand_limit: "This workspace has reached its brand limit.",
  stale: "That brand changed since you loaded it. Reload and try again.",
  error: "Something went wrong. Nothing was changed.",
};

/** Access policy: approved. Interim home until the application shell (feature 04). */
export default async function AppHomePage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const principal = await requireApprovedPage("/app");
  const { result } = await searchParams;
  const message = result ? RESULTS[result] : undefined;
  const workspace = await getOwnWorkspace(principal);
  const maxName = getAppConfig().limits.brandNameMaxLength;
  const brands = workspace
    ? await listBrands(getWorkspaceDeps(), principal, workspace.id, {
        includeArchived: true,
        cursor: null,
        limit: getAppConfig().limits.listPageSize,
      })
    : null;

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {workspace ? workspace.name : "Set up your workspace"}
        </h1>
        <form action={signOutAction}>
          <button type="submit" className="rounded-md border px-3 py-1.5">
            Sign out
          </button>
        </form>
      </header>
      {message ? (
        <p role="status" className="rounded-md border p-3">
          {message}
        </p>
      ) : null}
      {principal.isOwner ? (
        <Link href="/admin" className="underline">
          Owner area
        </Link>
      ) : null}

      {!workspace ? (
        <form action={createWorkspaceAction} className="space-y-3">
          <label className="block">
            <span className="block text-sm">Workspace name</span>
            <input name="name" required className="mt-1 w-full rounded-md border p-2" />
          </label>
          <button type="submit" className="rounded-md border px-4 py-2 font-medium">
            Create workspace
          </button>
        </form>
      ) : (
        <section aria-labelledby="brands-heading" className="space-y-4">
          <h2 id="brands-heading" className="text-lg font-medium">
            Brands
          </h2>
          {brands && brands.items.length === 0 ? (
            <p style={{ color: "var(--color-muted)" }}>
              No brands yet. Add your first brand below.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {brands?.items.map((brand) => (
                <li key={brand.id} className="flex items-center justify-between gap-3 p-3">
                  <span className={brand.archivedAt ? "line-through" : ""}>{brand.name}</span>
                  <form action={archiveBrandAction}>
                    <input type="hidden" name="brandId" value={brand.id} />
                    <input type="hidden" name="expectedRevision" value={brand.revision} />
                    <input
                      type="hidden"
                      name="archived"
                      value={brand.archivedAt ? "false" : "true"}
                    />
                    <button type="submit" className="rounded-md border px-3 py-1">
                      {brand.archivedAt ? "Restore" : "Archive"}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <form action={createBrandAction} className="flex flex-wrap items-end gap-3">
            <label className="block flex-1">
              <span className="block text-sm">New brand name</span>
              <input
                name="name"
                required
                maxLength={maxName}
                className="mt-1 w-full rounded-md border p-2"
              />
            </label>
            <button type="submit" className="rounded-md border px-4 py-2 font-medium">
              Add brand
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
