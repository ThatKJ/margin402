import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "pass" | "fail" | "hold";

const tones: Record<BadgeTone, { wrap: string; dot: string }> = {
  neutral: {
    wrap: "border-line text-mute bg-panel-2",
    dot: "bg-faint",
  },
  accent: {
    wrap: "border-accent-line text-accent-bright bg-accent-dim",
    dot: "bg-accent",
  },
  pass: {
    wrap: "border-pass-line text-pass bg-pass-dim",
    dot: "bg-pass",
  },
  fail: {
    wrap: "border-fail-line text-fail bg-fail-dim",
    dot: "bg-fail",
  },
  hold: {
    wrap: "border-hold/30 text-hold bg-hold-dim",
    dot: "bg-hold",
  },
};

export function Badge({
  tone = "neutral",
  pulse = false,
  children,
}: {
  tone?: BadgeTone;
  pulse?: boolean;
  children: ReactNode;
}) {
  const t = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-label uppercase ${t.wrap}`}
    >
      <span className={`h-1 w-1 rounded-full ${t.dot} ${pulse ? "animate-[breathe_1.6s_ease-in-out_infinite]" : ""}`} aria-hidden="true" />
      {children}
    </span>
  );
}
