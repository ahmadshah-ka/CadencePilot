import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth-actions";
import { ActiveLink } from "@/presentation/components/ui/active-link";
import { BrandSwitcher } from "./brand-switcher";
import type { ShellScope } from "@/presentation/workspaces/shell-scope";

const NAV = [
  { href: "/app", label: "This week", exact: true },
  { href: "/app/brands", label: "Brands", exact: false },
  { href: "/app/content", label: "Content", exact: false },
  { href: "/app/calendar", label: "Calendar", exact: false },
  { href: "/app/progress", label: "Progress", exact: false },
  { href: "/app/settings", label: "Settings", exact: false },
] as const;

const ITEM =
  "cp-transition flex min-h-11 items-center rounded-md px-3 text-sm text-muted hover:text-ink";
const ACTIVE = "bg-sunken font-medium text-ink";

function NavList({ ariaLabel }: { ariaLabel: string }) {
  return (
    <nav aria-label={ariaLabel}>
      <ul className="flex flex-col gap-1">
        {NAV.map((item) => (
          <li key={item.href}>
            <ActiveLink
              href={item.href}
              exact={item.exact}
              className={ITEM}
              activeClassName={ACTIVE}
            >
              {item.label}
            </ActiveLink>
          </li>
        ))}
        <li className="lg:hidden">
          <ActiveLink href="/app/assistant" className={ITEM} activeClassName={ACTIVE}>
            Assistant
          </ActiveLink>
        </li>
      </ul>
    </nav>
  );
}

/**
 * Authenticated application chrome: workspace and brand scope, primary navigation (sidebar on
 * desktop, disclosure menu on mobile) and the brand-assistant panel (desktop) with an honest
 * unavailable state until that feature exists. Rendered only after the server approves the user.
 */
export function AppShell({
  productName,
  scope,
  isOwner,
  children,
}: {
  productName: string;
  scope: ShellScope;
  isOwner: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 px-(--cp-gutter) py-2">
          <div className="flex items-center gap-4">
            <Link href="/app" className="font-display text-xl tracking-tight">
              {productName}
            </Link>
            {scope.workspace ? (
              <p className="hidden text-sm text-muted sm:block">
                Workspace: <span className="text-ink">{scope.workspace.name}</span>
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {scope.workspace ? (
              <BrandSwitcher brands={scope.brands} selectedId={scope.selectedBrand?.id ?? null} />
            ) : null}
            <details className="relative lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-md border border-line px-4 text-sm">
                Menu
              </summary>
              <div className="absolute right-0 z-40 mt-2 w-56 rounded-xl border border-line bg-surface p-2 shadow-lg">
                <NavList ariaLabel="Main (mobile)" />
                {isOwner ? (
                  <Link href="/admin" className={`${ITEM} mt-1`}>
                    Owner area
                  </Link>
                ) : null}
                <form action={signOutAction} className="mt-1">
                  <button type="submit" className={`${ITEM} w-full text-left`}>
                    Sign out
                  </button>
                </form>
              </div>
            </details>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4.5rem)] lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[14rem_minmax(0,1fr)_20rem]">
        <aside className="hidden border-r border-line px-3 py-6 lg:block">
          <NavList ariaLabel="Main" />
          <div className="mt-6 space-y-1 border-t border-line pt-4">
            {isOwner ? (
              <Link href="/admin" className={ITEM}>
                Owner area
              </Link>
            ) : null}
            <form action={signOutAction}>
              <button type="submit" className={`${ITEM} w-full text-left`}>
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <main id="main" className="min-w-0 px-(--cp-gutter) py-8">
          <p className="mb-6 text-sm text-muted" data-testid="scope-label">
            Viewing:{" "}
            <span className="text-ink">
              {scope.selectedBrand ? scope.selectedBrand.name : "All brands"}
            </span>
          </p>
          {children}
        </main>

        <aside
          aria-labelledby="assistant-panel-title"
          className="hidden border-l border-line px-4 py-6 xl:block"
        >
          <h2 id="assistant-panel-title" className="font-display text-xl">
            Brand assistant
          </h2>
          <p className="mt-2 text-sm text-muted">
            The assistant is not available yet. When it arrives it will answer in the context of the
            brand you are viewing and show where each remembered fact came from.
          </p>
        </aside>
      </div>
    </div>
  );
}
