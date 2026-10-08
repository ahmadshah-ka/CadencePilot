import Link from "next/link";

export function SiteFooter({ productName }: { productName: string }) {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-6 px-(--cp-gutter) py-10 text-sm text-muted">
        <div className="max-w-sm space-y-2">
          <p className="font-display text-lg text-ink">{productName}</p>
          <p>A content planning assistant in early development. Access is by owner approval.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/how-it-works" className="hover:text-ink">
            How it works
          </Link>
          <Link href="/research" className="hover:text-ink">
            Research
          </Link>
          <Link href="/request-access" className="hover:text-ink">
            Request access
          </Link>
          <Link href="/sign-in" className="hover:text-ink">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
