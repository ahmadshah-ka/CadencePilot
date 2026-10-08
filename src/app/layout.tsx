import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getContainer } from "@/infrastructure/composition";
import "./globals.css";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const { config } = getContainer();
  return { title: config.ok ? config.config.app.name : "Configuration required" };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
