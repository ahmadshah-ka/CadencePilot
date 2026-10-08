import Link from "next/link";
import type { ReactNode } from "react";
import { SkipLink } from "./skip-link";

/** Minimal layout for sign-in and account-status pages: no navigation, no product data. */
export function CenteredPage({
  productName,
  children,
}: {
  productName: string;
  children: ReactNode;
}) {
  return (
    <>
      <SkipLink />
      <main
        id="main"
        className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-(--cp-gutter) py-12"
      >
        <Link href="/" className="font-display text-xl tracking-tight text-muted hover:text-ink">
          {productName}
        </Link>
        {children}
      </main>
    </>
  );
}
