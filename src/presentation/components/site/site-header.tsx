import Link from "next/link";
import { ActiveLink } from "@/presentation/components/ui/active-link";
import { LinkButton } from "@/presentation/components/ui/button";

const LINKS = [
  { href: "/", label: "Product", exact: true },
  { href: "/how-it-works", label: "How it works", exact: false },
  { href: "/research", label: "Research", exact: false },
  { href: "/request-access", label: "Request access", exact: false },
] as const;

const LINK_CLASS = "cp-transition rounded-md px-3 py-2 text-sm text-muted hover:text-ink";
const ACTIVE_CLASS = "text-ink font-medium";

/** Public top navigation: product, how it works, research, request access, sign in. */
export function SiteHeader({ productName }: { productName: string }) {
  return (
    <header className="border-b border-line bg-canvas">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-(--cp-gutter) py-3">
        <Link href="/" className="font-display text-xl tracking-tight">
          {productName}
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <ActiveLink
              key={link.href}
              href={link.href}
              exact={link.exact}
              className={LINK_CLASS}
              activeClassName={ACTIVE_CLASS}
            >
              {link.label}
            </ActiveLink>
          ))}
          <LinkButton href="/sign-in" variant="secondary" className="ml-2">
            Sign in
          </LinkButton>
        </nav>
        <details className="relative md:hidden">
          <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-md border border-line px-4 text-sm">
            Menu
          </summary>
          <nav
            aria-label="Main (mobile)"
            className="absolute right-0 z-20 mt-2 flex w-56 flex-col rounded-xl border border-line bg-surface p-2 shadow-lg"
          >
            {LINKS.map((link) => (
              <ActiveLink
                key={link.href}
                href={link.href}
                exact={link.exact}
                className="rounded-md px-3 py-3 text-sm"
                activeClassName="bg-sunken font-medium"
              >
                {link.label}
              </ActiveLink>
            ))}
            <Link href="/sign-in" className="rounded-md px-3 py-3 text-sm">
              Sign in
            </Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
