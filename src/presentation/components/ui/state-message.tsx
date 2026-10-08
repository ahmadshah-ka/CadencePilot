import type { ReactNode } from "react";

/**
 * The shared set of screen states from ui-context.md: empty, loading, provider-limit/unavailable,
 * error, forbidden and stale/conflicting update. Every state says what happened and what to do.
 */
export type StateTone =
  "empty" | "loading" | "unavailable" | "error" | "forbidden" | "stale" | "info";

const LIVE: Record<StateTone, "status" | "alert" | undefined> = {
  empty: undefined,
  loading: "status",
  unavailable: undefined,
  error: "alert",
  forbidden: undefined,
  stale: "status",
  info: "status",
};

const ACCENT: Record<StateTone, string> = {
  empty: "border-line",
  loading: "border-line",
  unavailable: "border-line",
  error: "border-danger",
  forbidden: "border-warning",
  stale: "border-warning",
  info: "border-line",
};

export function StateMessage({
  tone,
  title,
  children,
  action,
  className = "",
}: {
  tone: StateTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section
      role={LIVE[tone]}
      aria-busy={tone === "loading" ? true : undefined}
      className={`rounded-xl border border-dashed ${ACCENT[tone]} bg-sunken px-6 py-8 ${className}`}
    >
      <h2 className="font-display text-xl">{title}</h2>
      {children ? <div className="mt-2 max-w-prose text-muted">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

/** Placeholder block shown only where it clarifies layout while real data loads. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-sunken motion-reduce:animate-none ${className}`}
    />
  );
}
