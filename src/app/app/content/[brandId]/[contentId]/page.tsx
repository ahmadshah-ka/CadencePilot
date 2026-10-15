import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getContent, listContent } from "@/application/content/content-use-cases";
import { isAppError } from "@/domain/errors/app-error";
import { contentDeps } from "@/presentation/api/content-routes";
import { requireApprovedPage } from "@/presentation/auth/page-guards";
import { getOwnWorkspace } from "@/presentation/workspaces/workspace-context";
import { PageHeader } from "@/presentation/components/ui/page-header";
import { CreateContentForm, ContentEditor } from "@/presentation/components/content/content-forms";
export const dynamic = "force-dynamic";
/** Workspace is resolved from the session; foreign IDs remain non-enumerable. */
export default async function ContentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandId: string; contentId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const ids = z.object({ brandId: z.uuid(), contentId: z.uuid() }).safeParse(await params);
  if (!ids.success) notFound();
  const principal = await requireApprovedPage("/app/content"),
    workspace = await getOwnWorkspace(principal);
  if (!workspace) notFound();
  const scope = { workspaceId: workspace.id, brandId: ids.data.brandId },
    deps = contentDeps();
  const detail = await getContent(deps, principal, scope, ids.data.contentId).catch((error) => {
    if (isAppError(error) && error.code === "NOT_FOUND") notFound();
    throw error;
  });
  const query = await searchParams,
    cursor = z.string().max(128).optional().safeParse(query.cursor);
  if (!cursor.success) notFound();
  const derivatives =
    detail.item.kind === "original"
      ? await listContent(deps, principal, scope, {
          parentId: detail.item.id,
          cursor: cursor.data ?? null,
          includeArchived: true,
          limit: deps.policy.listPageSize,
        })
      : null;
  const series =
    detail.item.kind === "original" && !detail.item.archivedAt
      ? await deps.content.listSeries(scope, {
          cursor: null,
          includeArchived: false,
          limit: deps.policy.listPageSize,
        })
      : null;
  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title={detail.item.title} />
      <Link href={`/app/content?brandId=${scope.brandId}`} className="underline">
        Back to content
      </Link>
      <ContentEditor key={detail.item.id} scope={scope} detail={detail} />
      {derivatives ? (
        <section className="space-y-4 border-t border-line pt-6">
          <h2 className="font-display text-2xl">Derivatives</h2>
          <ul className="space-y-3">
            {derivatives.items.map((child) => (
              <li key={child.id}>
                <Link className="underline" href={`/app/content/${scope.brandId}/${child.id}`}>
                  {child.title}
                </Link>
                {child.archivedAt ? " (archived)" : ""}
              </li>
            ))}
          </ul>
          {!derivatives.items.length ? (
            <p className="text-muted">No derivatives recorded.</p>
          ) : null}
          {derivatives.nextCursor ? (
            <Link
              className="underline"
              href={`?cursor=${encodeURIComponent(derivatives.nextCursor)}`}
            >
              Next derivatives page
            </Link>
          ) : null}
          {series ? (
            <CreateContentForm scope={scope} parentId={detail.item.id} series={series.items} />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
