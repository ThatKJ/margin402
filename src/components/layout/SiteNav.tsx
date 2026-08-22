"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useJob } from "@/lib/state/job-context";

const STEPS = [
  { path: "/quote", label: "Quote", num: "01" },
  { path: "/execution", label: "Execution", num: "02" },
  { path: "/statement", label: "Statement", num: "03" },
] as const;

export function SiteNav({ replayMode }: { replayMode: boolean }) {
  const pathname = usePathname();
  const { revenue, outcome } = useJob();

  const enabled = (path: string) => {
    if (path === "/quote") return true;
    if (path === "/execution") return revenue !== null;
    if (path === "/statement") return outcome !== null;
    return false;
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-line bg-base/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-sm px-margin-mobile md:h-16 md:px-margin-desktop">
        <div className="flex items-center gap-md">
          <Link
            href="/"
            aria-label="Margin402 overview"
            className="flex items-baseline gap-[3px] text-[17px] font-semibold tracking-[-0.02em] text-ink"
          >
            Margin<span className="text-accent">402</span>
          </Link>
          <nav className="hidden items-center gap-xs md:flex" aria-label="Primary">
            <NavLink href="/" active={pathname === "/"}>
              Overview
            </NavLink>
            {STEPS.map((step) => {
              const isEnabled = enabled(step.path);
              const active = pathname === step.path;
              if (!isEnabled) {
                return (
                  <span
                    key={step.path}
                    aria-disabled="true"
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm text-faint/70"
                  >
                    <StepNum num={step.num} state="locked" />
                    {step.label}
                  </span>
                );
              }
              return (
                <NavLink key={step.path} href={step.path} active={active}>
                  <StepNum num={step.num} state={active ? "active" : "done"} />
                  {step.label}
                </NavLink>
              );
            })}
          </nav>
        </div>

        <nav
          className="flex items-center gap-sm text-[12px] md:hidden"
          aria-label="Job progress"
        >
          {STEPS.map((step, i) => {
            const isEnabled = enabled(step.path);
            const active = pathname === step.path;
            return isEnabled ? (
              <Link
                key={step.path}
                href={step.path}
                aria-current={active ? "page" : undefined}
                className={`px-1 py-1 ${active ? "font-semibold text-ink" : "text-mute"}`}
              >
                {i + 1}. {step.label}
              </Link>
            ) : (
              <span key={step.path} aria-disabled="true" className="px-1 py-1 text-faint/60">
                {i + 1}. {step.label}
              </span>
            );
          })}
        </nav>

        {/*
         * Chain name deliberately omitted here — this header renders on
         * every page, including the customer path (/quote, /execution,
         * /statement). CLAUDE.md: "The customer path contains ZERO
         * blockchain vocabulary... no chain names above the fold. Settlement
         * proof goes in the statement footer in small grey type." The
         * generation-mode indicator (cached vs live candidate code) isn't
         * blockchain vocabulary, so it's fine to keep site-wide.
         */}
        <div className="hidden shrink-0 items-center gap-xs rounded-sm border border-line bg-panel px-2.5 py-1 md:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${replayMode ? "bg-hold" : "bg-pass"}`} aria-hidden="true" />
          <span className="text-label uppercase text-mute">{replayMode ? "Replay" : "Live"}</span>
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm transition-colors ${
        active ? "font-medium text-ink" : "text-mute hover:text-ink"
      }`}
    >
      {children}
      {active && <span className="absolute inset-x-2 -bottom-[13px] h-0.5 bg-accent" aria-hidden="true" />}
    </Link>
  );
}

function StepNum({ num, state }: { num: string; state: "locked" | "active" | "done" }) {
  return (
    <span
      className={`tabular text-[10px] ${
        state === "active" ? "text-accent" : state === "done" ? "text-faint" : "text-faint/50"
      }`}
      aria-hidden="true"
    >
      {num}
    </span>
  );
}
