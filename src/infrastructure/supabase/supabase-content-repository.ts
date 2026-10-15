import { z } from "zod";
import type {
  ContentRepository,
  ContentRecord,
  SeriesRecord,
  ContentScope,
  ContentQuery,
  RecordPage,
  ProductionTask,
  PublicationRecord,
} from "@/application/ports/content-repository";
import { AppError } from "@/domain/errors/app-error";
import { createUserClient, type SupabaseSettings } from "./clients";
import { mapDatabaseError } from "./db-errors";
const CONTENT_COLUMNS =
  "id,workspace_id,brand_id,parent_id,series_id,kind,format,title,source_url,source_transcript,notes,production_stage,revision,archived_at,created_at";
const CONTENT_LIST_COLUMNS = CONTENT_COLUMNS.replace(",source_transcript,notes", "");
const SERIES_COLUMNS = "id,workspace_id,brand_id,title,revision,archived_at,created_at";
const MAX_RESOURCE_ROWS = 100;
type ContentRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  parent_id: string | null;
  series_id: string | null;
  kind: ContentRecord["kind"];
  format: ContentRecord["format"];
  title: string;
  source_url: string;
  source_transcript: string;
  notes: string;
  production_stage: ContentRecord["productionStage"];
  revision: number;
  archived_at: string | null;
  created_at: string;
};
type SeriesRow = {
  id: string;
  workspace_id: string;
  brand_id: string;
  title: string;
  revision: number;
  archived_at: string | null;
  created_at: string;
};
const mapContent = (r: ContentRow): ContentRecord => ({
  id: r.id,
  workspaceId: r.workspace_id,
  brandId: r.brand_id,
  parentId: r.parent_id,
  seriesId: r.series_id,
  kind: r.kind,
  format: r.format,
  title: r.title,
  sourceUrl: r.source_url,
  sourceTranscript: r.source_transcript ?? "",
  notes: r.notes ?? "",
  productionStage: r.production_stage,
  revision: r.revision,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
});
const mapSeries = (r: SeriesRow): SeriesRecord => ({
  id: r.id,
  workspaceId: r.workspace_id,
  brandId: r.brand_id,
  title: r.title,
  revision: r.revision,
  archivedAt: r.archived_at,
  createdAt: r.created_at,
});
const unavailable = () =>
  new AppError("DEPENDENCY_UNAVAILABLE", "Content records are temporarily unavailable.");
function cursorParts(cursor: string): [string, string] {
  const parts = cursor.split("|");
  if (
    parts.length !== 2 ||
    !z.iso.datetime({ offset: true }).safeParse(parts[0]).success ||
    !z.uuid().safeParse(parts[1]).success
  )
    throw new AppError("INVALID_REQUEST", "Invalid cursor.");
  return parts as [string, string];
}
/** Session-scoped repository; RPCs recheck scope and perform writes transactionally. */
export function createSupabaseContentRepository(settings: SupabaseSettings): ContentRepository {
  async function rpc(name: string, scope: ContentScope, params: Record<string, unknown>) {
    const client = await createUserClient(settings);
    const { data, error } = await client.rpc(name, {
      p_workspace: scope.workspaceId,
      p_brand: scope.brandId,
      ...params,
    });
    if (error) throw mapDatabaseError(error);
    return data;
  }
  async function page<T extends ContentRow | SeriesRow, R>(
    table: string,
    columns: string,
    scope: ContentScope,
    query: ContentQuery,
    map: (row: T) => R,
  ): Promise<RecordPage<R>> {
    const client = await createUserClient(settings);
    let request = client
      .from(table)
      .select(columns)
      .eq("workspace_id", scope.workspaceId)
      .eq("brand_id", scope.brandId)
      .order("created_at")
      .order("id")
      .limit(query.limit + 1);
    if (!query.includeArchived) request = request.is("archived_at", null);
    if (query.parentId) request = request.eq("parent_id", query.parentId);
    if (query.cursor) {
      const [date, id] = cursorParts(query.cursor);
      request = request.or(`created_at.gt."${date}",and(created_at.eq."${date}",id.gt.${id})`);
    }
    const { data, error } = await request.returns<T[]>();
    if (error) throw unavailable();
    const rows = data ?? [],
      selected = rows.slice(0, query.limit),
      last = selected.at(-1);
    return {
      items: selected.map(map),
      nextCursor: rows.length > query.limit && last ? `${last.created_at}|${last.id}` : null,
    };
  }
  return {
    list: (scope, query) => page("content_items", CONTENT_LIST_COLUMNS, scope, query, mapContent),
    listSeries: (scope, query) => page("series", SERIES_COLUMNS, scope, query, mapSeries),
    async detail(scope, id) {
      const client = await createUserClient(settings);
      const { data, error } = await client
        .from("content_items")
        .select(CONTENT_COLUMNS)
        .eq("workspace_id", scope.workspaceId)
        .eq("brand_id", scope.brandId)
        .eq("id", id)
        .maybeSingle<ContentRow>();
      if (error) throw unavailable();
      if (!data) return null;
      const [tasks, pubs] = await Promise.all([
        client
          .from("tasks")
          .select("id,stage,position,completed_at,revision")
          .eq("workspace_id", scope.workspaceId)
          .eq("brand_id", scope.brandId)
          .eq("content_id", id)
          .order("position")
          .limit(MAX_RESOURCE_ROWS)
          .returns<
            Array<{
              id: string;
              stage: ProductionTask["stage"];
              position: number;
              completed_at: string | null;
              revision: number;
            }>
          >(),
        client
          .from("publications")
          .select("id,platform,published_at,url,revision")
          .eq("workspace_id", scope.workspaceId)
          .eq("brand_id", scope.brandId)
          .eq("content_id", id)
          .order("platform")
          .limit(MAX_RESOURCE_ROWS)
          .returns<
            Array<{
              id: string;
              platform: string;
              published_at: string | null;
              url: string;
              revision: number;
            }>
          >(),
      ]);
      if (tasks.error || pubs.error) throw unavailable();
      const series = data.series_id
        ? await client
            .from("series")
            .select("title")
            .eq("workspace_id", scope.workspaceId)
            .eq("brand_id", scope.brandId)
            .eq("id", data.series_id)
            .maybeSingle<{ title: string }>()
        : { data: null, error: null };
      if (series.error) throw unavailable();
      return {
        item: mapContent(data),
        seriesTitle: series.data?.title ?? null,
        tasks: (tasks.data ?? []).map((t) => ({
          id: t.id,
          stage: t.stage,
          position: t.position,
          completedAt: t.completed_at,
          revision: t.revision,
        })),
        publications: (pubs.data ?? []).map((p): PublicationRecord => ({
          id: p.id,
          platform: p.platform,
          publishedAt: p.published_at,
          url: p.url,
          revision: p.revision,
        })),
      };
    },
    async create(scope, c) {
      const id = await rpc("create_manual_content", scope, {
        p_request: c.requestId,
        p_title: c.title,
        p_format: c.format,
        p_parent: c.parentId,
        p_series: c.seriesId,
      });
      if (typeof id !== "string") throw unavailable();
      return id;
    },
    async edit(scope, id, c) {
      await rpc("edit_manual_content", scope, {
        p_id: id,
        p_revision: c.expectedRevision,
        p_title: c.title,
        p_url: c.sourceUrl,
        p_transcript: c.sourceTranscript,
        p_notes: c.notes,
      });
    },
    async archive(scope, id, revision, archived) {
      await rpc("archive_manual_content", scope, {
        p_id: id,
        p_revision: revision,
        p_archived: archived,
      });
    },
    async setTask(scope, id, revision, stage, completed) {
      await rpc("set_manual_content_task", scope, {
        p_id: id,
        p_revision: revision,
        p_stage: stage,
        p_completed: completed,
      });
    },
    async savePublication(scope, id, c) {
      await rpc("save_manual_publication", scope, {
        p_id: id,
        p_revision: c.expectedRevision,
        p_platform: c.platform,
        p_published_at: c.publishedAt,
        p_url: c.url,
      });
    },
    async createSeries(scope, requestId, title) {
      const id = await rpc("create_manual_series", scope, { p_request: requestId, p_title: title });
      if (typeof id !== "string") throw unavailable();
      return id;
    },
    async editSeries(scope, id, revision, title, archived) {
      await rpc("edit_manual_series", scope, {
        p_id: id,
        p_revision: revision,
        p_title: title,
        p_archived: archived,
      });
    },
  };
}
