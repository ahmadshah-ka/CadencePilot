import type { ReactNode } from "react";
import { SiteFooter } from "@/presentation/components/site/site-footer";
import { SiteHeader } from "@/presentation/components/site/site-header";
import { SkipLink } from "@/presentation/components/ui/skip-link";
import { getProductName } from "@/presentation/site/product-name";

export const dynamic = "force-dynamic";

/** Access policy: public. Shared chrome for the marketing pages. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  const productName = getProductName();
  return (
    <>
      <SkipLink />
      <SiteHeader productName={productName} />
      <main id="main" className="mx-auto max-w-6xl px-(--cp-gutter)">
        {children}
      </main>
      <SiteFooter productName={productName} />
    </>
  );
}
