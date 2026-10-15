import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getShellScope } from "@/presentation/workspaces/shell-scope";
import { requireApprovedPage } from "@/presentation/auth/page-guards";
import { PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";
import { BrandAssistant } from "@/presentation/components/assistant/brand-assistant";
export const dynamic = "force-dynamic";
/** Explicit selected-brand scope. Switching brands remounts the client and aborts the old stream. */
export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<{ brandId?: string }>;
}) {
  await requireApprovedPage("/app/assistant");
  const shell = await getShellScope(),
    query = await searchParams;
  if (!shell.workspace || !shell.brands.length)
    return (
      <StateMessage tone="empty" title="Add a brand first">
        <Link className="underline" href="/app/brands">
          Open brands
        </Link>
      </StateMessage>
    );
  if (query.brandId && !z.uuid().safeParse(query.brandId).success) notFound();
  const brand = query.brandId
    ? shell.brands.find((b) => b.id === query.brandId)
    : (shell.selectedBrand ?? shell.brands[0]);
  if (!brand) notFound();
  return (
    <div className="space-y-7">
      <PageHeader
        title="Brand assistant"
        description="Private conversations, confirmed preferences and answers grounded in your records."
      />
      <form className="flex flex-wrap items-end gap-3">
        <label>
          Assistant brand
          <select
            name="brandId"
            defaultValue={brand.id}
            className="ml-3 min-h-11 rounded border border-line bg-surface px-3"
          >
            {shell.brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <button className="min-h-11 rounded border border-line px-4">Open brand</button>
      </form>
      <BrandAssistant
        key={brand.id}
        workspaceId={shell.workspace.id}
        brandId={brand.id}
        brandName={brand.name}
        brands={shell.brands}
      />
    </div>
  );
}
