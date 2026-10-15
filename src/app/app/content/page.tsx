import Link from "next/link";
import { z } from "zod";
import { notFound } from "next/navigation";
import { getContainer } from "@/infrastructure/composition";
import { contentDeps } from "@/presentation/api/content-routes";
import { listContent, authorizeContent } from "@/application/content/content-use-cases";
import { getShellScope } from "@/presentation/workspaces/shell-scope";
import { requireApprovedPage } from "@/presentation/auth/page-guards";
import { PageHeader } from "@/presentation/components/ui/page-header";
import { StateMessage } from "@/presentation/components/ui/state-message";
import { CreateContentForm, SeriesForms } from "@/presentation/components/content/content-forms";
export const dynamic = "force-dynamic";
/** Approved users list one authorized brand at a time, with bounded cursor queries. */
export default async function ContentPage({
  searchParams,
}: {
  searchParams: Promise<{
    brandId?: string;
    cursor?: string;
    seriesCursor?: string;
    archived?: string;
  }>;
}) {
  const principal = await requireApprovedPage("/app/content"),
    shell = await getShellScope(),
    query = await searchParams;
  const parsed = z
    .object({
      brandId: z.uuid().optional(),
      cursor: z.string().max(128).optional(),
      seriesCursor: z.string().max(128).optional(),
      archived: z.enum(["true", "false"]).optional(),
    })
    .safeParse(query);
  if (!parsed.success) notFound();
  if (!shell.workspace || shell.brands.length === 0)
    return (
      <StateMessage tone="empty" title="Add a brand first">
        <Link href="/app/brands" className="underline">
          Open brands
        </Link>
      </StateMessage>
    );
  const brand = parsed.data.brandId
    ? shell.brands.find((b) => b.id === parsed.data.brandId)
    : (shell.selectedBrand ?? shell.brands[0]);
  if (!brand) notFound();
  const scope = { workspaceId: shell.workspace.id, brandId: brand.id },
    deps = contentDeps(getContainer());
  const records = await listContent(deps, principal, scope, {
    cursor: parsed.data.cursor ?? null,
    includeArchived: parsed.data.archived === "true",
    limit: deps.policy.listPageSize,
  });
  await authorizeContent(deps, principal, scope);
  const series = await deps.content.listSeries(scope, {
    cursor: parsed.data.seriesCursor ?? null,
    includeArchived: true,
    limit: deps.policy.listPageSize,
  });
  const link = (extra: Record<string, string>) =>
    `/app/content?${new URLSearchParams({ brandId: brand.id, archived: parsed.data.archived ?? "false", ...extra })}`;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Content"
        description="Originals, derivatives and actual publication records. No AI or automatic posting."
      />
      <form className="flex flex-wrap items-end gap-3">
        <label>
          Brand
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
        <label className="flex min-h-11 items-center gap-2">
          <input
            name="archived"
            type="checkbox"
            value="true"
            defaultChecked={parsed.data.archived === "true"}
          />
          Include archived
        </label>
        <button className="min-h-11 underline">Apply filter</button>
      </form>
      {records.items.length ? (
        <ul className="divide-y divide-line border-y border-line">
          {records.items.map((item) => (
            <li key={item.id} className="py-4">
              <Link className="font-medium underline" href={`/app/content/${brand.id}/${item.id}`}>
                {item.title}
              </Link>
              <p className="mt-1 text-sm text-muted">
                {item.kind} · {item.format} · {item.productionStage}
                {item.archivedAt ? " · archived" : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <StateMessage tone="empty" title="No content records yet">
          Add an original below. Open it to record progress, publications and linked derivatives.
        </StateMessage>
      )}
      {records.nextCursor ? (
        <Link href={link({ cursor: records.nextCursor })} className="underline">
          Next content page
        </Link>
      ) : null}
      <CreateContentForm key={brand.id} scope={scope} series={series.items} />
      <SeriesForms key={`series:${brand.id}`} scope={scope} series={series.items} />
      {series.nextCursor ? (
        <Link href={link({ seriesCursor: series.nextCursor })} className="underline">
          Next series page
        </Link>
      ) : null}
    </div>
  );
}
