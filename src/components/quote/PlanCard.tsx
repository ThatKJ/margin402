"use client";

import { useState } from "react";
import { formatUsd } from "@/lib/ui/format";
import type { CustomerPlan } from "@/lib/economics/plans";
import { Button } from "@/components/primitives/Button";

export function PlanCard({
  plan,
  selected,
  expanded,
  onChoose,
  onToggleExpand,
}: {
  plan: CustomerPlan;
  selected: boolean;
  expanded: boolean;
  onChoose: () => void;
  onToggleExpand: () => void;
}) {
  const [justChose, setJustChose] = useState(false);
  const recommended = plan.recommended;

  return (
    <article
      className={`relative flex flex-col rounded-xl border bg-panel p-lg transition-all duration-300 ${
        recommended ? "border-accent-line shadow-lift" : "border-line shadow-card hover:shadow-lift"
      } ${selected ? "ring-2 ring-accent ring-offset-2 ring-offset-base" : ""}`}
      aria-label={`${plan.name} plan`}
    >
      {recommended && (
        <span className="absolute -top-2.5 left-lg flex items-center gap-1.5 rounded-sm border border-accent-line bg-accent-dim px-2 py-0.5 text-label uppercase text-accent">
          <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
            <path d="M5 0l1.3 3.4L10 3.7 7.4 6l.8 3.5L5 7.6 1.8 9.5 2.6 6 0 3.7l3.7-.3L5 0z" />
          </svg>
          Recommended
        </span>
      )}

      <div className="flex items-baseline justify-between gap-sm">
        <h3 className="text-title">{plan.name}</h3>
        <span className="text-meta text-faint">{plan.riskLabel} risk</span>
      </div>
      <p className="mt-1 text-body-sm text-mute">{plan.objective}</p>

      <div className="mt-md">
        <span className="text-label uppercase text-faint">Fixed price</span>
        <p className="tabular mt-xs text-[40px] font-semibold leading-none tracking-tight">
          {formatUsd(plan.price)}
        </p>
      </div>

      <dl className="mt-md grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
        <div className="bg-panel px-2 py-sm">
          <dt className="text-label uppercase text-faint">Confidence</dt>
          <dd className="tabular mt-1 text-data font-semibold">{Math.round(plan.firstAttemptPassRate * 100)}%</dd>
        </div>
        <div className="bg-panel px-2 py-sm">
          <dt className="text-label uppercase text-faint">Starts with</dt>
          <dd className="tabular mt-1 text-data font-semibold">{plan.strategyOrder[0]}</dd>
        </div>
      </dl>

      <ul className="mt-md flex flex-col gap-1.5">
        {plan.tradeoffs.slice(0, 3).map((t) => (
          <li key={t} className="flex items-start gap-2 text-body-sm text-mute">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-line-strong" aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-lg">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex w-full items-center justify-between border-t border-line pt-sm text-left text-body-sm font-medium text-mute transition-colors hover:text-ink"
        >
          View strategy
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div
          className={`grid transition-all duration-300 ease-out ${
            expanded ? "mt-sm grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <dl className="flex flex-col gap-sm rounded-lg border border-line bg-well p-md text-body-sm">
              <Detail k="Execution policy" v={plan.executionPolicy} />
              <Detail k="Retry" v={plan.retryPolicy} />
              <Detail k="Escalation" v={plan.escalationPolicy} />
              <Detail k="Verification" v={plan.verificationPolicy} />
              <Detail k="If it can't finish" v={plan.refundPolicy} />
              <div>
                <dt className="text-label uppercase text-faint">Path</dt>
                <dd className="tabular mt-1 text-data text-ink">{plan.strategyOrder.join(" → ")}</dd>
              </div>
            </dl>
          </div>
        </div>

        <Button variant={recommended || selected ? "primary" : "secondary"} className="mt-md w-full" onClick={() => { setJustChose(true); onChoose(); }}>
          {selected ? "Selected" : justChose ? "Selected ✓" : `Choose ${plan.name}`}
        </Button>
      </div>
    </article>
  );
}

function Detail({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-label uppercase text-faint">{k}</dt>
      <dd className="mt-1 leading-relaxed text-mute">{v}</dd>
    </div>
  );
}
