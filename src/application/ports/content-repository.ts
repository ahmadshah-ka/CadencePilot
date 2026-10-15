import type { ContentFormat, TaskStage } from "@/domain/content/content-rules";
export interface ContentScope {
  workspaceId: string;
  brandId: string;
}
export interface ContentRecord extends ContentScope {
  id: string;
  parentId: string | null;
  seriesId: string | null;
  kind: "original" | "derivative";
  format: ContentFormat;
  title: string;
  sourceUrl: string;
  sourceTranscript: string;
  notes: string;
  productionStage: "planned" | "recorded" | "edited" | "ready";
  revision: number;
  archivedAt: string | null;
  createdAt: string;
}
export interface SeriesRecord extends ContentScope {
  id: string;
  title: string;
  revision: number;
  archivedAt: string | null;
  createdAt: string;
}
export interface ProductionTask {
  id: string;
  stage: TaskStage;
  position: number;
  completedAt: string | null;
  revision: number;
}
export interface PublicationRecord {
  id: string;
  platform: string;
  publishedAt: string | null;
  url: string;
  revision: number;
}
export interface ContentDetail {
  seriesTitle?: string | null;
  item: ContentRecord;
  tasks: ProductionTask[];
  publications: PublicationRecord[];
}
export interface RecordPage<T> {
  items: T[];
  nextCursor: string | null;
}
export interface ContentQuery {
  cursor: string | null;
  limit: number;
  includeArchived: boolean;
  parentId?: string;
}
export type ContentCreate = {
  requestId: string;
  title: string;
  format: ContentFormat;
  parentId: string | null;
  seriesId: string | null;
};
export type ContentEdit = {
  expectedRevision: number;
  title: string;
  sourceUrl: string;
  sourceTranscript: string;
  notes: string;
};
export type PublicationInput = {
  expectedRevision: number;
  platform: string;
  publishedAt: string | null;
  url: string;
};
/** All calls use the caller's session and explicit workspace/brand filters; writes use database CAS/RPC. */
export interface ContentRepository {
  list(scope: ContentScope, query: ContentQuery): Promise<RecordPage<ContentRecord>>;
  detail(scope: ContentScope, id: string): Promise<ContentDetail | null>;
  listSeries(scope: ContentScope, query: ContentQuery): Promise<RecordPage<SeriesRecord>>;
  create(scope: ContentScope, input: ContentCreate): Promise<string>;
  edit(scope: ContentScope, id: string, input: ContentEdit): Promise<void>;
  archive(scope: ContentScope, id: string, revision: number, archived: boolean): Promise<void>;
  setTask(
    scope: ContentScope,
    id: string,
    revision: number,
    stage: TaskStage,
    completed: boolean,
  ): Promise<void>;
  savePublication(scope: ContentScope, id: string, input: PublicationInput): Promise<void>;
  createSeries(scope: ContentScope, requestId: string, title: string): Promise<string>;
  editSeries(
    scope: ContentScope,
    id: string,
    revision: number,
    title: string,
    archived: boolean,
  ): Promise<void>;
}
