import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/actions/auth-actions";
import { ActiveLink } from "@/presentation/components/ui/active-link";
import { SkipLink } from "@/presentation/components/ui/skip-link";
import { getProductName } from "@/presentation/site/product-name";

export const dynamic = "force-dynamic";

const LINK = "cp-transition rounded-md px-3 py-2 text-sm text-muted hover:text-ink";

/**
 * Owner area chrome, separate from the customer shell. The pages inside enforce the owner policy
 * (and MFA) on the server; this layout only provides navigation.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <header className="border-b border-line bg-sunken">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-(--cp-gutter) py-3">
          <p className="font-display text-xl">
            {getProductName()} <span className="text-muted">· Owner area</span>
          </p>
          <nav aria-label="Owner" className="flex flex-wrap items-center gap-1">
            <ActiveLink href="/admin" exact className={LINK} activeClassName="text-ink font-medium">
              Access requests
            </ActiveLink>
            <ActiveLink href="/admin/mfa" className={LINK} activeClassName="text-ink font-medium">
              Two-step verification
            </ActiveLink>
            <Link href="/app" className={LINK}>
              Back to app
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={`${LINK} min-h-11`}>
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl px-(--cp-gutter) py-8">
        {children}
      </main>
    </>
  );
}
