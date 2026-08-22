"use client";

import { useEffect, useRef, useState } from "react";

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-xs">
      <code className="tabular truncate rounded-sm border border-line bg-well px-2 py-1 text-[12px] text-mute" title={value}>
        {label ?? value}
      </code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border border-line text-faint transition-colors hover:border-line-strong hover:text-ink"
      >
        {copied ? (
          <svg className="h-3.5 w-3.5 text-pass" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 3.5h-7a1 1 0 00-1 1v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </div>
  );
}
