import Link from "next/link";
import type { ComponentProps } from "react";

export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
export type ButtonSize = "md" | "lg";

const BASE =
  "cp-transition inline-flex min-h-11 items-center justify-center gap-2 rounded-md font-medium " +
  "disabled:cursor-not-allowed disabled:opacity-60";
const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-line bg-surface text-ink hover:border-muted",
  quiet: "text-ink underline-offset-4 hover:underline",
  danger: "border border-danger text-danger hover:bg-sunken",
};
const SIZES: Record<ButtonSize, string> = { md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };

/** Class string for any element that should look like a button (forms, links, buttons). */
export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={`${buttonClasses(variant, size)} ${className ?? ""}`} {...props} />;
}

export function LinkButton({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link className={`${buttonClasses(variant, size)} ${className ?? ""}`} {...props} />;
}
