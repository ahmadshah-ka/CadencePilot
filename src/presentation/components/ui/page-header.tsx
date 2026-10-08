import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
      <div>
        <h1 className="font-display text-3xl tracking-tight sm:text-4xl">{title}</h1>
        {description ? <p className="mt-2 max-w-prose text-muted">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}

/** Flash message after a server action; announced to screen readers. */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="rounded-md border border-line bg-surface px-4 py-3 text-sm">
      {children}
    </p>
  );
}
