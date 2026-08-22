import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-xs font-medium tracking-[-0.01em] transition-all duration-[130ms] ease-out select-none rounded-md disabled:pointer-events-none disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-white hover:bg-ink-hover active:translate-y-px",
  secondary:
    "border border-line-strong bg-panel text-ink hover:border-accent-line hover:text-accent active:translate-y-px",
  ghost: "text-mute hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "h-10 px-sm text-[14px]",
  lg: "h-12 px-md text-[15px]",
};

function classes(variant: Variant, size: Size, className?: string) {
  return [base, variants[variant], sizes[size], className].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: { variant?: Variant; size?: Size; children: ReactNode } & ComponentPropsWithoutRef<"button">) {
  return (
    <button className={classes(variant, size, className)} {...props}>
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: Variant;
  size?: Size;
  className?: string;
  children: ReactNode;
}) {
  if (/^https?:/.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={classes(variant, size, className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={classes(variant, size, className)}>
      {children}
    </Link>
  );
}

export function ArrowRight({ className }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 transition-transform duration-[260ms] ease-out group-hover:translate-x-0.5 ${className ?? ""}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2.5 8h11M9.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
