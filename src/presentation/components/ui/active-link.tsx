"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

/** A link that marks itself with aria-current="page" when it points at the current location. */
export function ActiveLink({
  href,
  exact = false,
  className = "",
  activeClassName = "",
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  exact?: boolean;
  activeClassName?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${className} ${active ? activeClassName : ""}`}
      {...props}
    />
  );
}
