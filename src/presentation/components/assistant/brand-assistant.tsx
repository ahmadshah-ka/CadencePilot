"use client";
import { useEffect, useRef, useState, useId, type FormEvent } from "react";
import Link from "next/link";
import type { AssistantSnapshot, AssistantMessage } from "@/application/ports/assistant-repository";
import type { BrandPreferences, PersonalPreferences } from "@/domain/preferences/preference-rules";
import { assistantPolicy as policy } from "@/config/assistant-policy";
import { buttonClasses } from "@/presentation/components/ui/button";
interface State extends AssistantSnapshot {
  stats: Record<string, string>;
  missing: string[];
  settings: { brand: BrandPreferences; personal: PersonalPreferences };
  retentionDays: number;
}
interface Props {
  workspaceId: string;
  brandId: string;
  brandName: string;
  brands?: { id: string; name: string }[];
  compact?: boolean;
}
const INPUT = "min-h-11 w-full rounded-md border border-line bg-surface px-3 py-2";
const STAT_LABELS: Record<string, string> = {
  originals_created: "Original records",
  derivatives_created: "Derivative records",
  videos_ready: "Videos ready",
  shorts_ready: "Shorts ready",
  posts_ready: "Posts ready",
  videos_recorded: "Videos recorded",
  publications: "Platform publications",
};
/** User/brand-keyed state has no shared browser cache. Unmount/scope change aborts in-flight reads and generation. */
export function BrandAssistant({
  workspaceId,
  brandId,
  brandName,
  brands = [],
  compact = false,
}: Props) {
  const base = `/api/v1/workspaces/${workspaceId}/brands/${brandId}/assistant`,
    uid = useId();
  const [data, setData] = useState<State | null>(null),
    [error, setError] = useState(""),
    [text, setText] = useState(""),
    [draft, setDraft] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [mode, setMode] = useState<"chat" | "onboarding">("chat"),
    [compare, setCompare] = useState<string[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [source, setSource] = useState<AssistantMessage | null>(null);
  const alive = useRef(true),
    stream = useRef<AbortController | null>(null),
    requestId = useRef<string | null>(null),
    loadVersion = useRef(0);
  const [memoryKey, setMemoryKey] = useState(""),
    [memoryValue, setMemoryValue] = useState(""),
    [memoryScope, setMemoryScope] = useState<"brand" | "personal">("brand");
  async function json(path: string, init?: RequestInit) {
    const res = await fetch(base + path, { ...init, cache: "no-store" });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error?.message ?? "Assistant unavailable.");
    return body;
  }
  async function load(page: string | null = cursor) {
    const version = ++loadVersion.current;
    try {
      const next = await json(page ? `?cursor=${encodeURIComponent(page)}` : "");
      if (alive.current && version === loadVersion.current) setData(next);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Could not load the assistant.");
    }
  }
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    const version = ++loadVersion.current;
    fetch(base, { signal: abort.signal, cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error?.message ?? "Assistant unavailable.");
        if (alive.current && version === loadVersion.current) setData(body);
      })
      .catch((e) => {
        if (!abort.signal.aborted && alive.current)
          setError(e instanceof Error ? e.message : "Assistant unavailable.");
      });
    return () => {
      alive.current = false;
      abort.abort();
      stream.current?.abort();
    };
  }, [base]);
  async function command(action: string, input: unknown) {
    setError("");
    setBusy(true);
    try {
      await json("/commands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, input }),
      });
      await load();
      setStatus("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save. Your input is preserved.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    setError("");
    setDraft("");
    setSource(null);
    setBusy(true);
    stream.current = new AbortController();
    let completed = false;
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch(base + "/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: stream.current.signal,
        body: JSON.stringify({
          requestId: requestId.current,
          text,
          mode,
          compareBrandIds: compare,
        }),
      });
      if (!response.ok) {
        const e = await response.json();
        throw new Error(e.error?.message ?? "Assistant unavailable.");
      }
      if (!response.body) throw new Error("The response was interrupted.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "";
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          buffer += decoder.decode(next.value, { stream: true });
          let end = buffer.indexOf("\n\n");
          while (end >= 0) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const type = block
                .split("\n")
                .find((l) => l.startsWith("event: "))
                ?.slice("event: ".length),
              raw = block
                .split("\n")
                .find((l) => l.startsWith("data: "))
                ?.slice("data: ".length);
            if (raw) {
              const value = JSON.parse(raw);
              if (type === "error") {
                requestId.current = null;
                throw new Error(value.error.message);
              }
              if (type === "status") setStatus(value.message);
              if (type === "delta") setDraft(value.text);
              if (type === "done") {
                if (value.replay && value.status !== "complete")
                  throw new Error(
                    "That attempt did not complete. Edit your message and send again.",
                  );
                completed = true;
                setDraft("");
                setText("");
                requestId.current = null;
                setStatus("Response saved.");
              }
            }
            end = buffer.indexOf("\n\n");
          }
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      if (!completed) throw new Error("The response was interrupted. Your message is preserved.");
    } catch (e) {
      if (alive.current) {
        setDraft("");
        setError(
          stream.current?.signal.aborted
            ? "Stopped. No partial answer was saved."
            : e instanceof Error
              ? e.message
              : "Assistant unavailable.",
        );
      }
    } finally {
      if (alive.current) {
        setBusy(false);
        setCursor(null);
        await load(null);
      }
    }
  }
  async function showSource(id: string) {
    try {
      const result = await json(`/source?messageId=${encodeURIComponent(id)}`);
      setSource(result.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Source unavailable.");
    }
  }
  async function exportPage() {
    try {
      const result = await json(
          "/export" + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""),
        ),
        url = URL.createObjectURL(
          new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "brand-assistant-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export unavailable.");
    }
  }
  return (
    <section className="space-y-5" aria-label={compact ? "Assistant panel" : "Assistant workspace"}>
      <p className="text-sm text-muted">
        Private chat for <strong className="text-ink">{brandName}</strong>. Proposals need
        confirmation.
      </p>
      {data && !compact ? (
        <section className="space-y-3">
          <h2 className="font-display text-xl">Verified records</h2>
          <p className="text-sm text-muted">
            Ready means production-ready. Originals and derivatives are records; publication counts
            are actual uploads. Archived content is excluded.
          </p>
          <dl className="grid grid-cols-2 gap-3">
            {Object.entries(data.stats).map(([key, value]) => (
              <div key={key}>
                <dt className="text-sm text-muted">{STAT_LABELS[key] ?? key}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
      {!compact ? (
        <div className="flex flex-wrap gap-3">
          <Link className="underline" href={`/app/brands/${brandId}/preferences`}>
            Brand settings form
          </Link>
          <Link className="underline" href="/app/settings">
            Personal settings form
          </Link>
          <button disabled={busy} onClick={() => void exportPage()} className="underline">
            Export this history page
          </button>
        </div>
      ) : (
        <Link className="underline text-sm" href={`/app/assistant?brandId=${brandId}`}>
          Open history and memory
        </Link>
      )}
      <p role="alert" className="text-sm">
        {error}
      </p>
      {source ? (
        <aside className="rounded border border-line p-3">
          <h3 className="font-semibold">Memory source</h3>
          <p className="whitespace-pre-wrap break-words text-sm">
            {source.body ?? "Source has been forgotten."}
          </p>
          <button onClick={() => setSource(null)} className="underline">
            Close source
          </button>
        </aside>
      ) : null}
      <ol className="space-y-4" aria-label="Conversation history">
        {[...(data?.messages ?? [])]
          .reverse()
          .slice(compact ? -4 : 0)
          .map((m) => (
            <li key={m.id} id={`${uid}-${m.id}`} className="rounded-md border border-line p-3">
              <p className="text-xs font-semibold text-muted">
                {m.role === "user" ? "You" : "Assistant"} · {m.status}
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">
                {m.forgottenAt
                  ? "This exchange was forgotten."
                  : (m.body ??
                    (m.status === "failed"
                      ? "The response did not complete."
                      : "Waiting for a completed response…"))}
              </p>
              {!compact && !m.forgottenAt ? (
                <button
                  disabled={busy}
                  className="mt-2 text-xs underline"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Forget both messages in this exchange and memories sourced from them? This cannot be undone.",
                      )
                    )
                      void command("forget-message", {
                        id: m.id,
                        revision: m.revision,
                        confirmed: true,
                      });
                  }}
                >
                  Forget exchange
                </button>
              ) : null}
              {!compact && !m.forgottenAt
                ? m.proposals.map((proposal, index) => (
                    <div key={index} className="mt-3 border-t border-line pt-3 text-sm">
                      <p className="font-semibold">
                        Proposed{" "}
                        {proposal.kind === "memory"
                          ? `${proposal.scope} memory: ${proposal.key}`
                          : `setting: ${proposal.field}`}
                      </p>
                      <p className="whitespace-pre-wrap break-words">{proposal.value}</p>
                      <button
                        disabled={busy || m.confirmed.includes(index)}
                        className={buttonClasses("secondary")}
                        onClick={() => void command("confirm", { messageId: m.id, index })}
                      >
                        {m.confirmed.includes(index) ? "Confirmed" : "Confirm proposal"}
                      </button>
                    </div>
                  ))
                : null}
            </li>
          ))}
      </ol>
      {draft ? (
        <div
          aria-label="Provisional response"
          className="whitespace-pre-wrap break-words rounded border border-line p-3 text-sm"
        >
          <p className="mb-2 text-xs text-muted">Provisional — not saved yet</p>
          {draft}
        </div>
      ) : null}
      {!compact && data?.nextCursor ? (
        <button
          disabled={busy}
          className="underline"
          onClick={() => {
            setCursor(data.nextCursor);
            void load(data.nextCursor);
          }}
        >
          Older messages
        </button>
      ) : null}
      {!compact && cursor ? (
        <button
          className="ml-3 underline"
          onClick={() => {
            setCursor(null);
            void load(null);
          }}
        >
          Latest messages
        </button>
      ) : null}
      <form onSubmit={send} className="space-y-3">
        <fieldset disabled={busy} className="space-y-3">
          <legend className="font-display text-xl">Ask your assistant</legend>
          <label className="block text-sm">
            Conversation mode
            <select
              className={INPUT}
              value={mode}
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              <option value="chat">Brand questions</option>
              <option value="onboarding">Set up this brand</option>
            </select>
          </label>
          {mode === "onboarding" && data ? (
            <p className="text-sm text-muted">
              {data.missing.length
                ? `Still to discuss: ${data.missing.join(", ")}.`
                : "Your basic settings are filled in. You can discuss changes."}
            </p>
          ) : null}
          <label className="block text-sm">
            Your message
            <textarea
              className={INPUT}
              rows={compact ? 3 : 4}
              maxLength={policy.messageMaxLength}
              required
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                requestId.current = null;
              }}
            />
          </label>
          {!compact && brands.some((b) => b.id !== brandId) ? (
            <details>
              <summary className="min-h-11 cursor-pointer py-2 text-sm">
                Compare brands explicitly
              </summary>
              <p className="text-xs text-muted">
                Only selected brands’ counts are shared with this conversation. Their conversations
                and memories stay excluded.
              </p>
              {brands
                .filter((b) => b.id !== brandId)
                .map((b) => (
                  <label key={b.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={compare.includes(b.id)}
                      onChange={(e) =>
                        setCompare((old) =>
                          e.target.checked ? [...old, b.id] : old.filter((id) => id !== b.id),
                        )
                      }
                    />
                    {b.name}
                  </label>
                ))}
            </details>
          ) : null}
          <button className={buttonClasses("primary")}>Send message</button>
        </fieldset>
      </form>
      {busy ? (
        <button className="underline text-sm" onClick={() => stream.current?.abort()}>
          Stop response
        </button>
      ) : null}
      <p role="status" className="text-sm text-muted">
        {status}
      </p>
      <p className="text-xs text-muted">
        If AI is unavailable, use the settings forms. Chat history expires after{" "}
        {data?.retentionDays ?? policy.retentionDays} days; confirmed memories stay until forgotten.
      </p>
      {!compact && data ? (
        <section className="space-y-4 border-t border-line pt-5">
          <h2 className="font-display text-2xl">Confirmed memory</h2>
          <p className="text-sm text-muted">
            Personal memories apply to your own brands. Brand memories stay here. Editing or
            forgetting memory clears affected summaries and excludes older chat from future context.
          </p>
          {data.memories.length === 0 ? (
            <p className="text-sm">No confirmed memories yet.</p>
          ) : null}
          {data.memories.map((m) => (
            <form
              key={`${m.id}:${m.revision}`}
              className="space-y-2 rounded border border-line p-3"
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void command("memory", {
                  id: m.id,
                  revision: m.revision,
                  scope: m.scope,
                  key: m.key,
                  value: String(values.get("value")),
                  forget: false,
                });
              }}
            >
              <p className="text-sm font-semibold">
                {m.scope} · {m.key}
              </p>
              <label className="block text-sm">
                Memory value: {m.key}
                <textarea
                  name="value"
                  className={INPUT}
                  defaultValue={m.value}
                  maxLength={policy.memoryValueMaxLength}
                  required
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button disabled={busy} className={buttonClasses("secondary")}>
                  Save memory
                </button>
                {m.sourceMessageId ? (
                  <button
                    type="button"
                    className="underline text-sm"
                    onClick={() => void showSource(m.sourceMessageId!)}
                  >
                    View source
                  </button>
                ) : (
                  <span className="text-xs text-muted">Saved or edited directly by you</span>
                )}
                <button
                  type="button"
                  disabled={busy}
                  className="underline text-sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        "Forget this memory? It will also be removed from affected summaries and future context.",
                      )
                    )
                      void command("memory", {
                        id: m.id,
                        revision: m.revision,
                        scope: m.scope,
                        key: m.key,
                        value: m.value,
                        forget: true,
                      });
                  }}
                >
                  Forget memory
                </button>
              </div>
            </form>
          ))}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void command("memory", {
                id: null,
                revision: 0,
                scope: memoryScope,
                key: memoryKey,
                value: memoryValue,
                forget: false,
              });
            }}
          >
            <h3 className="font-semibold">Save a memory explicitly</h3>
            <label className="block text-sm">
              Memory scope
              <select
                className={INPUT}
                value={memoryScope}
                onChange={(e) => setMemoryScope(e.target.value as typeof memoryScope)}
              >
                <option value="brand">This brand</option>
                <option value="personal">My personal preferences</option>
              </select>
            </label>
            <label className="block text-sm">
              Memory name (lowercase letters, digits, underscores)
              <input
                className={INPUT}
                value={memoryKey}
                onChange={(e) => setMemoryKey(e.target.value)}
                required
                pattern="[a-z][a-z0-9_-]*"
                maxLength={policy.memoryKeyMaxLength}
              />
            </label>
            <label className="block text-sm">
              New memory value
              <textarea
                className={INPUT}
                value={memoryValue}
                onChange={(e) => setMemoryValue(e.target.value)}
                required
                maxLength={policy.memoryValueMaxLength}
              />
            </label>
            <button disabled={busy} className={buttonClasses("secondary")}>
              Save new memory
            </button>
          </form>
          {data.conversation ? (
            <button
              disabled={busy}
              className="text-sm underline"
              onClick={() => {
                if (
                  window.confirm(
                    "Forget this brand’s entire chat and memories sourced from it? This cannot be undone. Memories saved directly remain.",
                  )
                )
                  void command("forget-conversation", {
                    id: null,
                    revision: data.conversation!.revision,
                    confirmed: true,
                  });
              }}
            >
              Forget this conversation
            </button>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
