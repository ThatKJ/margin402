"use client";

import { useEffect, useRef, useState } from "react";
import { Reveal } from "@/components/primitives/Reveal";
import { expectedCostToSuccess } from "@/lib/economics/expected-cost";
import { priceForRound } from "@/lib/providers/price-curve";
import { formatUsd } from "@/lib/ui/format";
import { usePrefersReducedMotion, wait } from "@/lib/ui/motion";

const premiumAtRejection = {
  id: "s3",
  label: "Premium",
  price: priceForRound("s3", 3),
  pSuccess: 0.85,
};
const repairThen = { id: "s2", label: "Repair", price: 0.09, pSuccess: 0.45 };
const catalog = [repairThen, premiumAtRejection];

const expectedPremium = expectedCostToSuccess(premiumAtRejection, catalog);
const expectedRepair = expectedCostToSuccess(repairThen, catalog);
const availableBudget = 1.05 - 0.05 - 0.09;

export function TheMoment() {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [beat, setBeat] = useState(0);
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setBeat(4);
      return;
    }
    let cancelled = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();
        const f = reduced ? 0 : 1;
        (async () => {
          await wait(300 * f);
          if (cancelled) return;
          setBeat(1);
          await wait(700 * f + 500);
          if (cancelled) return;
          setBeat(2);
          await wait(1500);
          if (cancelled) return;
          setBeat(3);
          await wait(1400 * f + 400);
          if (cancelled) return;
          setBeat(4);
        })();
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [reduced]);

  const maxExpected = Math.max(expectedPremium, expectedRepair);

  return (
    <section className="border-t border-line bg-panel">
      <div ref={ref} className="mx-auto max-w-[1200px] px-margin-mobile py-section md:px-margin-desktop">
        <div className="flex flex-col items-center text-center">
          <Reveal>
            <p className="flex items-center justify-center gap-sm text-label uppercase text-faint">
              <span className="tabular text-accent">03</span>
              <span className="h-px w-6 bg-line-strong" aria-hidden="true" />
              The moment that matters
            </p>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-md max-w-[36rem] text-headline">It could afford the payment. It chose not to make it.</h2>
          </Reveal>
        </div>

        <div className="mx-auto mt-xl grid max-w-3xl grid-cols-1 gap-sm md:grid-cols-2">
          <div
            className={`flex flex-col gap-xs rounded-lg border bg-panel p-lg transition-all duration-500 ${
              beat >= 1 ? "border-line shadow-card opacity-100" : "pointer-events-none border-transparent opacity-0"
            }`}
            aria-hidden={beat < 1}
          >
            <p className="text-label uppercase text-faint">Requested</p>
            <p className="tabular text-stat">{formatUsd(premiumAtRejection.price)}</p>
            <p className="text-body-sm text-mute">Premium provider — third round of the canonical job</p>
          </div>
          <div
            className={`flex flex-col gap-xs rounded-lg border bg-panel p-lg transition-all duration-500 ${
              beat >= 2 ? "border-line shadow-card opacity-100" : "pointer-events-none border-transparent opacity-0"
            }`}
            aria-hidden={beat < 2}
          >
            <p className="text-label uppercase text-faint">Available budget</p>
            <p className="tabular text-stat">{formatUsd(availableBudget)}</p>
            <p className="flex items-center gap-xs text-body-sm font-medium text-pass">
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
                <path d="M5 8.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Affordable
            </p>
          </div>
        </div>

        <div
          className={`mx-auto mt-sm max-w-3xl transition-all duration-700 ${
            beat >= 3 ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
          }`}
          aria-hidden={beat < 3}
        >
          <div className="rounded-lg border border-line bg-panel p-lg shadow-card">
            <p className="text-label uppercase text-faint">Expected cost-to-success</p>
            <div className="mt-md flex flex-col gap-md">
              <Bar label="Repair — next action" value={expectedRepair} max={maxExpected} tone="accent" />
              <Bar label="Premium — this request" value={expectedPremium} max={maxExpected} tone="fail" />
            </div>
            <p className="mt-md text-body-sm text-mute">
              A cheaper path to a verified outcome remains available. Paying more now would be economically irrational —
              regardless of affordability.
            </p>
          </div>
        </div>

        <div
          className={`mx-auto mt-sm max-w-3xl transition-all duration-700 ${
            beat >= 4 ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
          }`}
          aria-live="polite"
        >
          <div className="rounded-lg border border-fail-line bg-fail-dim p-lg">
            <div className="flex flex-col items-start justify-between gap-sm md:flex-row md:items-center">
              <div>
                <p className="tabular text-stat text-fail line-through decoration-fail/50">{formatUsd(premiumAtRejection.price)}</p>
                <p className="mt-1 text-title font-semibold tracking-tight text-fail">REJECTED</p>
              </div>
              <p className="max-w-[20rem] text-left text-body-sm text-mute md:text-right">
                &ldquo;Payment rejected: economically inferior to available alternative.&rdquo;
              </p>
            </div>
          </div>
          <p className="mt-lg text-center text-body text-mute">
            Affordable does not mean economical. That distinction <em>is</em> the product.
          </p>
        </div>
      </div>
    </section>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "accent" | "fail" }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div>
      <div className="mb-xs flex items-baseline justify-between">
        <span className="text-body-sm text-mute">{label}</span>
        <span className="tabular text-data">{formatUsd(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-3">
        <div
          className={`h-full rounded-full ${tone === "fail" ? "bg-fail/70" : "bg-accent"}`}
          style={{ width: shown ? `${(value / max) * 100}%` : "0%", transition: "width 900ms var(--ease-out)" }}
        />
      </div>
    </div>
  );
}
