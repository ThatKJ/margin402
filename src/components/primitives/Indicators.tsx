export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M15 8a7 7 0 00-7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function StatusDot({ tone = "pass", pulse = false }: { tone?: "pass" | "accent" | "hold" | "fail"; pulse?: boolean }) {
  const colors = {
    pass: "bg-pass",
    accent: "bg-accent",
    hold: "bg-hold",
    fail: "bg-fail",
  } as const;
  return (
    <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
      {pulse && <span className={`absolute inline-flex h-full w-full rounded-full ${colors[tone]} opacity-60 animate-ping`} />}
      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${colors[tone]}`} />
    </span>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-panel-3 ${className}`} aria-hidden="true" />;
}
