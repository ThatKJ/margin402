"use client";

import { useEffect, useState } from "react";
import { Reveal } from "@/components/primitives/Reveal";
import { usePrefersReducedMotion } from "@/lib/ui/motion";

const STAGES = [
  {
    key: "QUOTE",
    title: "One fixed price",
    body: "The customer submits a task and its tests. Margin402 answers with a single all-in quote for the verified outcome — not an hourly meter.",
  },
  {
    key: "PAY",
    title: "Margin402's own capital",
    body: "Each provider attempt is paid for by Margin402 over x402, from its own execution budget. The customer never touches a provider.",
  },
  {
    key: "EXECUTE",
    title: "Sandboxed work",
    body: "The paid provider returns candidate code that runs in a hardened sandbox — hard timeout, memory cap, no network.",
  },
  {
    key: "VERIFY",
    title: "Binary verification",
    body: "Every attempt faces all eight tests — including hidden ones the provider never saw. All pass, or nothing ships.",
  },
  {
    key: "DECIDE",
    title: "Economic re-selection",
    body: "After every result the engine re-ranks what remains by expected cost-to-success — and will decline a price it can afford when a better path exists.",
  },
  {
    key: "SETTLE",
    title: "Published settlement",
    body: "Every payment lands as a real Algorand transaction. The final statement lists them all, receipts included.",
  },
];

export function Mechanism() {
  const [selected, setSelected] = useState(0);
  const [touched, setTouched] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (touched || reduced) return;
    const id = setInterval(() => setSelected((s) => (s + 1) % STAGES.length), 3200);
    return () => clearInterval(id);
  }, [touched, reduced]);

  const stage = STAGES[selected];

  return (
    <section id="how-it-works" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto max-w-[1200px] px-margin-mobile py-section md:px-margin-desktop">
        <div className="flex flex-col items-start justify-between gap-md md:flex-row md:items-end">
          <Reveal>
            <p className="flex items-center gap-sm text-label uppercase text-faint">
              <span className="tabular text-accent">02</span>
              <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
              The core mechanism
            </p>
            <h2 className="mt-md max-w-[32rem] text-headline">Quote → pay → execute → verify → decide → settle.</h2>
          </Reveal>
          <Reveal delay={100}>
            <p className="max-w-[24rem] text-body-sm text-mute">
              The loop repeats per attempt until the outcome verifies or Margin402 refunds. Follow a single pass:
            </p>
          </Reveal>
        </div>

        <Reveal delay={140}>
          <div
            className="mt-xl grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3 lg:grid-cols-6"
            role="tablist"
            aria-label="Execution loop stages"
            onMouseEnter={() => setTouched(true)}
            onTouchStart={() => setTouched(true)}
          >
            {STAGES.map((s, i) => {
              const active = i === selected;
              return (
                <button
                  key={s.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setTouched(true);
                    setSelected(i);
                  }}
                  onFocus={() => setTouched(true)}
                  className={`group relative flex min-h-[92px] flex-col justify-between overflow-hidden bg-panel p-md text-left transition-colors duration-200 ${
                    active ? "bg-accent-dim" : "hover:bg-panel-2"
                  }`}
                >
                  <span className="tabular text-[10px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`text-body-sm font-medium tracking-wide ${active ? "text-accent" : "text-ink"}`}>
                    {s.key}
                  </span>
                  {!reduced && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute bottom-0 left-0 h-px w-full bg-line"
                    >
                      <span
                        className={`absolute top-0 h-full w-8 bg-accent ${active ? "opacity-90" : "opacity-0"}`}
                        style={
                          active && !reduced
                            ? { animation: "sweep 3.2s var(--ease-inout) infinite" }
                            : undefined
                        }
                      />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Reveal>

        <Reveal delay={200}>
          <div className="mt-md flex flex-col gap-xs rounded-lg border border-line bg-panel p-lg shadow-card" aria-live="polite">
            <p className="text-label uppercase text-faint">{stage.key}</p>
            <h3 className="text-title">{stage.title}</h3>
            <p className="max-w-2xl text-body-sm text-mute">{stage.body}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
