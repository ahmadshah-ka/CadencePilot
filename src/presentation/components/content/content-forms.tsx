"use client";
import { isSafeExternalUrl } from "@/domain/content/content-rules";
import { useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type {
  ContentDetail,
  ContentScope,
  SeriesRecord,
} from "@/application/ports/content-repository";
import { CONTENT_FORMATS, type ContentFormat } from "@/domain/content/content-rules";
import { contentPolicy } from "@/config/content-policy";
import onboarding from "@/config/onboarding-policy.json";
import { buttonClasses } from "@/presentation/components/ui/button";
const INPUT = "mt-1 min-h-11 w-full rounded-md border border-line bg-surface px-3";
const LABELS = { video: "Video", short: "Short", post: "Written post" };
const TASK_LABELS = { record: "Recorded", edit: "Edited", ready: "Ready" };
const DETAIL_ROOT = "/app/content";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
async function command(
  scope: ContentScope,
  action: string,
  id: string | null,
  input: unknown,
): Promise<{ id: string | null }> {
  const response = await fetch(
    `/api/v1/workspaces/${scope.workspaceId}/brands/${scope.brandId}/content-commands`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id, input }),
    },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 409
        ? "This record changed or that step is not available. Your unsaved input is still here; copy it before reloading."
        : (result.error?.message ?? "Could not save. Your draft is preserved."),
    );
  return result;
}
/** A stable request ID is reused on retries, preventing duplicate records after a lost response. */
export function CreateContentForm({
  scope,
  series,
  parentId = null,
}: {
  scope: ContentScope;
  series: SeriesRecord[];
  parentId?: string | null;
}) {
  const router = useRouter(),
    request = useRef<string | null>(null);
  const [title, setTitle] = useState(""),
    [format, setFormat] = useState<ContentFormat>(CONTENT_FORMATS[0]),
    [seriesId, setSeriesId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      request.current ??= crypto.randomUUID();
      const result = await command(scope, "create", null, {
        requestId: request.current,
        title,
        format,
        parentId,
        seriesId: seriesId || null,
      });
      router.push(`${DETAIL_ROOT}/${scope.brandId}/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={busy} className="space-y-4">
        <legend className="mb-3 font-display text-xl">
          {parentId ? "Add a derivative" : "Add original content"}
        </legend>
        <Field label={parentId ? "Derivative title" : "Content title"}>
          <input
            className={INPUT}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={contentPolicy.titleMaxLength}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Content format">
            <select
              className={INPUT}
              value={format}
              onChange={(e) => setFormat(e.target.value as ContentFormat)}
            >
              {CONTENT_FORMATS.map((value) => (
                <option key={value} value={value}>
                  {LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Series (optional)">
            <select
              className={INPUT}
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
            >
              <option value="">No series</option>
              {series
                .filter((s) => !s.archivedAt)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.title}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <p role="alert">{error}</p>
        <button type="submit" className={buttonClasses("primary")}>
          {busy ? "Saving…" : parentId ? "Create derivative" : "Create original"}
        </button>
      </fieldset>
    </form>
  );
}
/** Manual series naming/archive controls; no automatic episode generation. */
export function SeriesForms({ scope, series }: { scope: ContentScope; series: SeriesRecord[] }) {
  const router = useRouter(),
    request = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [pending, start] = useTransition(),
    [title, setTitle] = useState(""),
    [message, setMessage] = useState("");
  async function run(action: string, id: string | null, input: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await command(scope, action, id, input);
      if (action === "create-series") {
        setTitle("");
        request.current = null;
      }
      start(() => router.refresh());
      setMessage("Series saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 border-t border-line pt-6">
      <h2 className="font-display text-2xl">Series</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          request.current ??= crypto.randomUUID();
          void run("create-series", null, { requestId: request.current, title });
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label="New series title">
          <input
            required
            className={INPUT}
            value={title}
            maxLength={contentPolicy.titleMaxLength}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <button disabled={busy || pending} className={buttonClasses("secondary")}>
          Add series
        </button>
      </form>
      <p role="status">{message}</p>
      <ul className="divide-y divide-line">
        {series.map((s) => (
          <li key={`${s.id}:${s.revision}`} className="py-3">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void run("edit-series", s.id, {
                  expectedRevision: s.revision,
                  title: String(values.get("title")),
                  archived: values.get("archived") === "on",
                });
              }}
            >
              <Field label={`Series name: ${s.title}`}>
                <input
                  name="title"
                  required
                  defaultValue={s.title}
                  maxLength={contentPolicy.titleMaxLength}
                  className={INPUT}
                />
              </Field>
              <label className="flex min-h-11 items-center gap-2">
                <input name="archived" type="checkbox" defaultChecked={!!s.archivedAt} />
                Archived
              </label>
              <button disabled={busy || pending} className={buttonClasses("secondary")}>
                Save series
              </button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}
const MINUTE_MILLISECONDS = 60000;
function localTime(value: string): string {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * MINUTE_MILLISECONDS)
    .toISOString()
    .slice(0, 16);
}

/** Records actual publication only; this form never uploads or publishes to a social service. */
function PublicationEditor({
  platform,
  record,
  busy,
  save,
}: {
  platform: string;
  record: ContentDetail["publications"][number] | undefined;
  busy: boolean;
  save: (input: unknown) => Promise<void>;
}) {
  const [published, setPublished] = useState(!!record?.publishedAt),
    [date, setDate] = useState(record?.publishedAt ? localTime(record.publishedAt) : ""),
    [url, setUrl] = useState(record?.url ?? "");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save({
          expectedRevision: record?.revision ?? 0,
          platform,
          publishedAt: published ? new Date(date).toISOString() : null,
          url,
        });
      }}
    >
      <label className="flex min-h-11 items-center gap-2">
        <input
          type="checkbox"
          checked={published}
          onChange={(e) => {
            setPublished(e.target.checked);
            if (e.target.checked && !date) setDate(localTime(new Date().toISOString()));
          }}
        />
        This has been published
      </label>
      {published ? (
        <Field label="Published at (your device’s local time)">
          <input
            className={INPUT}
            type="datetime-local"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
      ) : null}
      <Field label="Publication URL (optional)">
        <input
          type="url"
          className={INPUT}
          value={url}
          maxLength={contentPolicy.urlMaxLength}
          onChange={(e) => setUrl(e.target.value)}
        />
      </Field>
      <p className="text-sm text-muted">
        Uncheck published and save to correct an upload recorded by mistake. One platform record is
        kept per content item.
      </p>
      <button disabled={busy} className={buttonClasses("secondary")}>
        Save publication record
      </button>
    </form>
  );
}
/** Separate creation progress, immutable parent linkage, source transcript and publication facts. */
export function ContentEditor({ scope, detail }: { scope: ContentScope; detail: ContentDetail }) {
  const { item } = detail,
    router = useRouter();
  const [busy, setBusy] = useState(false),
    [pending, start] = useTransition(),
    [message, setMessage] = useState(""),
    [failed, setFailed] = useState(false);
  const [title, setTitle] = useState(item.title),
    [sourceUrl, setSourceUrl] = useState(item.sourceUrl),
    [transcript, setTranscript] = useState(item.sourceTranscript),
    [notes, setNotes] = useState(item.notes),
    [platform, setPlatform] = useState(onboarding.platforms[0]!);
  async function run(action: string, input: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await command(scope, action, item.id, input);
      setFailed(false);
      setMessage("Saved.");
      start(() => router.refresh());
      return true;
    } catch (e) {
      setFailed(true);
      setMessage(e instanceof Error ? e.message : "Could not save. Your draft is preserved.");
      return false;
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || pending,
    publication = detail.publications.find((p) => p.platform === platform);
  return (
    <div className="space-y-8">
      <p role={failed ? "alert" : "status"} aria-live="polite">
        {busy || pending ? "Saving…" : message}
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
        <span>
          {LABELS[item.format]} · {item.kind}
        </span>
        <span>Creation: {item.productionStage}</span>
        <span>{detail.publications.filter((p) => p.publishedAt).length} platform publications</span>
        {item.archivedAt ? <strong>Archived</strong> : null}
      </div>
      {detail.seriesTitle ? <p>Series: {detail.seriesTitle}</p> : null}
      {item.parentId ? (
        <Link className="underline" href={`${DETAIL_ROOT}/${scope.brandId}/${item.parentId}`}>
          View original content
        </Link>
      ) : null}
      <fieldset disabled={disabled || !!item.archivedAt} className="space-y-4">
        <legend className="mb-4 font-display text-2xl">Production checklist</legend>
        {detail.tasks.map((task, index) => (
          <label key={task.id} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              key={`${task.id}:${item.revision}`}
              defaultChecked={!!task.completedAt}
              disabled={
                !task.completedAt && detail.tasks.slice(0, index).some((t) => !t.completedAt)
              }
              onChange={(e) => {
                const input = e.currentTarget;
                void run("task", {
                  expectedRevision: item.revision,
                  stage: task.stage,
                  completed: input.checked,
                }).then((saved) => {
                  if (!saved) input.checked = !!task.completedAt;
                });
              }}
            />
            {TASK_LABELS[task.stage]}
          </label>
        ))}
        <p className="text-sm text-muted">
          Reopening an earlier step also reopens dependent steps. It does not change where you
          actually published.
        </p>
      </fieldset>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run("edit", {
            expectedRevision: item.revision,
            title,
            sourceUrl,
            sourceTranscript: transcript,
            notes,
          });
        }}
      >
        <fieldset disabled={disabled || !!item.archivedAt} className="space-y-4">
          <legend className="mb-4 font-display text-2xl">Content details</legend>
          <Field label="Title">
            <input
              className={INPUT}
              value={title}
              required
              maxLength={contentPolicy.titleMaxLength}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="Source or video URL (optional)">
            <input
              type="url"
              className={INPUT}
              value={sourceUrl}
              maxLength={contentPolicy.urlMaxLength}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </Field>
          <Field label="Source transcript (optional)">
            <textarea
              className={`${INPUT} py-2`}
              rows={6}
              value={transcript}
              maxLength={contentPolicy.transcriptMaxLength}
              onChange={(e) => setTranscript(e.target.value)}
            />
          </Field>
          <p className="text-sm text-muted">
            Paste the original transcript here. Untimed transcripts do not produce inferred clip
            timestamps.
          </p>
          <Field label="Notes or derivative draft">
            <textarea
              className={`${INPUT} py-2`}
              rows={4}
              value={notes}
              maxLength={contentPolicy.notesMaxLength}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <button className={buttonClasses("primary")}>Save content details</button>
        </fieldset>
      </form>
      <fieldset
        disabled={disabled || !!item.archivedAt}
        className="space-y-4 border-t border-line pt-6"
      >
        <legend className="font-display text-2xl">Publication records</legend>
        <ul className="space-y-2">
          {detail.publications.map((p) => (
            <li key={p.id}>
              {p.platform}: {p.publishedAt ? `Published ${p.publishedAt}` : "Not published"}
              {p.url ? (
                <a
                  href={isSafeExternalUrl(p.url) ? p.url : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-3 underline"
                >
                  Open publication
                </a>
              ) : null}
            </li>
          ))}
        </ul>
        <Field label="Publication platform">
          <select className={INPUT} value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {onboarding.platforms.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <PublicationEditor
          key={`${platform}:${publication?.revision ?? 0}`}
          platform={platform}
          record={publication}
          busy={disabled}
          save={async (input) => {
            await run("publication", input);
          }}
        />
      </fieldset>
      <button
        disabled={disabled}
        type="button"
        className={buttonClasses("secondary")}
        onClick={() =>
          void run("archive", { expectedRevision: item.revision, archived: !item.archivedAt })
        }
      >
        {item.archivedAt ? "Restore content" : "Archive content"}
      </button>
      <p className="text-sm text-muted">
        Archiving keeps the source, derivatives and publication history. It prevents new derivatives
        until the original is restored.
      </p>
    </div>
  );
}
