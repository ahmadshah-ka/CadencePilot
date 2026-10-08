import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getProductName } from "@/presentation/site/product-name";
import "./globals.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const name = getProductName();
  return {
    title: { default: name, template: `%s · ${name}` },
    description:
      "Plan an achievable weekly content schedule from your goals, your real availability and cited research.",
  };
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
