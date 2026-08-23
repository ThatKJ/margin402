"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveExecutionView, strategyLabel } from "@/lib/ui/derive";
import type { TimelineRow } from "@/lib/ui/derive";
import { formatUsd } from "@/lib/ui/format";
import { useCountUp, wait, usePrefersReducedMotion } from "@/lib/ui/motion";
import { useJob } from "@/lib/state/job-context";
import { getDefaultJobType } from "@/lib/workloads/job-types";
import { SIMULATED_MARKET_LABEL } from "@/lib/providers/price-curve";
import type { JobEvent, JobOutcome } from "@/lib/orchestrator/types";
import type { StepDecision } from "@/lib/economics/types";

const PLAN_NAMES: Record<string, string> = {
  "lowest-cost": "Lowest Cost",
  "best-value": "Best Value",
  "highest-confidence": "Highest Confidence",
};

export function ExecutionScreen() {
  const router = useRouter();
  const { revenue, jobId, events, pushEvent, outcome, planId, customerAgentId } = useJob();
  const hasEvents = events.length > 0;
  const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [streamOpen, setStreamOpen] = useState(false);
  const [streamLost, setStreamLost] = useState(false);
  const activePlanId = planId ?? "best-value";
  const jobType = getDefaultJobType();

  useEffect(() => {
    if (revenue === null) router.replace("/quote");
  }, [revenue, router]);

  // Reconnect policy: the server's own idempotency guards make retries safe
  // (409 rather than double payment), so transient drops — including the
  // dev Strict-Mode mount/unmount race — recover automatically instead of
  // wedging a live job behind a dead EventSource.
  useEffect(() => {
    if (revenue === null || jobId === null || hasEvents || outcome !== null) return;

    let source: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      source = new EventSource(`/api/jobs/execute?revenue=${revenue}&jobId=${jobId}&planId=${activePlanId}`);
      source.onopen = () => {
        if (!disposed) {
          setStreamOpen(true);
        }
      };
      source.onmessage = (message) => {
        const event: JobEvent = JSON.parse(message.data);
        pushEvent(event);
      };
      source.onerror = () => {
        source?.close();
        if (disposed) return;
        setStreamOpen(false);
        if (attempts >= 3) {
          setStreamLost(true);
          return;
        }
        attempts += 1;
        retryTimer = setTimeout(connect, 1200 * attempts);
      };
    };

    connect();
    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      source?.close();
    };
  }, [revenue, jobId]);

  const view = useMemo(() => deriveExecutionView(events), [events]);
  const decisionByRound = useMemo(() => {
    const map = new Map<number, StepDecision>();
    for (const e of events) if (e.type === "decision") map.set(e.round, e.step);
    return map;
  }, [events]);

  const { revealed, pending } = useRevealSequence(view.rows, decisionByRound, reducedMotion);

  useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "end" });
  }, [revealed.length, pending?.beat]);

  const revealCaughtUp = revealed.length >= view.rows.length && !pending;
  const displayOutcome = revealCaughtUp ? outcome : null;
  const running = displayOutcome === null;

  const revealedSpent = revealed
    .filter((r): r is Extract<TimelineRow, { kind: "paid" }> => r.kind === "paid")
    .reduce((sum, r) => sum + r.price, 0);
  const budgetRemaining = revenue === null ? 0 : revenue - revealedSpent;
  const budgetDisplay = useCountUp(budgetRemaining, 500);
  const spentDisplay = useCountUp(revealedSpent, 500);

  useEffect(() => {
    if (displayOutcome) {
      const t = setTimeout(() => router.push("/statement"), 1600);
      return () => clearTimeout(t);
    }
  }, [displayOutcome, router]);

  if (revenue === null) return null;

  return (
    <section className="mx-auto w-full max-w-[1100px] px-margin-mobile pt-28 pb-section md:px-margin-desktop md:pt-32">
      <div className="mb-xl flex flex-col gap-lg lg:flex-row lg:items-end lg:justify-between">
        <div className="flex max-w-[600px] flex-col gap-sm">
          <div className="flex items-center gap-xs text-label uppercase text-mute">
            <span className={`h-1.5 w-1.5 rounded-full ${streamOpen ? "bg-pass animate-pulse" : "bg-faint"}`} aria-hidden="true" />
            Execution
            <span className="h-3 w-px bg-line-strong" aria-hidden="true" />
            <span className="text-accent">Live agent run · {PLAN_NAMES[activePlanId]}</span>
          </div>
          <h1 className="text-headline leading-tight text-ink">
            {running
              ? "Working toward a verified outcome"
              : displayOutcome === "VERIFIED"
                ? "Outcome verified"
                : displayOutcome === "REFUNDED"
                  ? "Contract refunded"
                  : "Execution failed"}
          </h1>
          <p className="text-body-sm text-mute">
            {jobType.title} · requested by <span className="tabular text-ink">{customerAgentId}</span>
          </p>
          <div className="mt-xs flex items-center gap-sm font-mono text-data text-faint">
            <span>{jobType.functionSignature.match(/^function\s+(\w+)/)?.[1] ?? jobType.title}()</span>
            <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
            <span>{jobType.testCount} verification tests</span>
          </div>
          <p className="text-meta text-faint">Provider pricing shown is a {SIMULATED_MARKET_LABEL}.</p>
        </div>

        <div className="flex flex-col items-end gap-xs rounded-xl border border-line bg-panel p-lg lg:w-[280px] shrink-0" role="status">
          <div className="flex items-center gap-lg">
            <div className="text-right">
              <p className="text-label uppercase text-faint">Remaining</p>
              <p className={`tabular text-stat ${budgetRemaining < 0 ? "text-fail" : ""}`}>{formatUsd(budgetDisplay)}</p>
            </div>
            <div className="h-px w-px bg-line-strong lg:hidden" aria-hidden="true" />
            <div className="text-right">
              <p className="text-label uppercase text-faint">Spent</p>
              <p className="tabular text-stat">{formatUsd(spentDisplay)}</p>
            </div>
          </div>
          <div className="h-1 w-full mt-sm overflow-hidden rounded-full bg-line-strong">
            <div
              className={`h-full ${budgetRemaining < 0 ? "bg-fail/70" : "bg-accent"}`}
              style={{ width: `${revenue > 0 ? Math.min(100, (revealedSpent / revenue) * 100) : 0}%` }}
            />
          </div>
        </div>
      </div>

      {outcome === null && events.length > 0 && !streamOpen && (
        <p
          className={`mb-lg rounded-md border px-md py-sm text-body-sm ${
            streamLost ? "border-fail-line bg-fail-dim text-fail" : "border-hold/30 bg-hold-dim text-hold"
          }`}
          role="alert"
        >
          {streamLost
            ? "Connection to the orchestrator was lost before completion. No further provider spending will occur — start a new job to continue."
            : "Connection interrupted. Execution state is being protected — reconnecting…"}
        </p>
      )}

      <ol className="relative flex flex-col gap-xl border-l border-line pl-lg" aria-label="Execution timeline">
        {revealed.map((row, i) => (
          <li key={`${row.kind}-${row.round}-${row.strategyId}-${i}`} className="relative">
            <TimelineDot />
            {row.kind === "paid" ? (
              <AttemptCard
                row={row}
                previous={revealed.slice(0, i).reverse().find((r) => r.kind === "paid" && r.strategyId === row.strategyId)}
                verificationEvent={findVerificationEvent(events, row.round)}
              />
            ) : (
              <RejectedRowCard row={row} />
            )}
          </li>
        ))}
        {pending && (
          <li className="relative">
            <TimelineDot pulsing />
            <RejectionSequence decision={pending.decision} row={pending.row} beat={pending.beat} />
          </li>
        )}
        <div ref={scrollAnchorRef} />
      </ol>

      {running && revealed.length === view.rows.length && !pending && <PhaseIndicator events={events} streamOpen={streamOpen} />}
    </section>
  );
}

/**
 * Loading copy derived strictly from the last real event — never invented.
 * Before any event arrives the stream is connecting; after each event the
 * label names the step that is genuinely in flight next.
 */
function PhaseIndicator({ events, streamOpen }: { events: JobEvent[]; streamOpen: boolean }) {
  const last = events.at(-1);
  let phase = "Connecting to the orchestrator…";
  if (!streamOpen && events.length === 0) phase = "Requesting service…";
  else if (!last) phase = streamOpen ? "Requesting service…" : "Connecting to the orchestrator…";
  else if (last.type === "decision") phase = `Selecting provider — ${strategyLabel(last.step.selected?.strategyId ?? "")} chosen`;
  else if (last.type === "payment")
    phase = last.txId ? "Settled on Algorand · receiving provider result…" : "Awaiting x402 settlement…";
  else if (last.type === "verification") phase = last.verified ? "Preparing outcome statement…" : "Re-evaluating economics…";
  return (
    <div className="mt-lg flex items-center gap-2 py-2 text-xs text-mute" role="status" aria-live="polite">
      <span className="flex gap-1">
        {[0, 150, 300].map((delay) => (
          <span key={delay} className="h-1.5 w-1.5 animate-bounce rounded-full bg-mute" style={{ animationDelay: `${delay}ms` }} />
        ))}
      </span>
      {phase}
    </div>
  );
}

function findVerificationEvent(events: JobEvent[], round: number) {
  return events.find((e) => e.type === "verification" && e.round === round) as
    | Extract<JobEvent, { type: "verification" }>
    | undefined;
}

function useRevealSequence(
  rows: TimelineRow[],
  decisionByRound: Map<number, StepDecision>,
  reducedMotion: boolean,
): { revealed: TimelineRow[]; pending: { decision: StepDecision; row: Extract<TimelineRow, { kind: "rejected" }>; beat: number } | null } {
  const [revealIndex, setRevealIndex] = useState(0);
  const [beat, setBeat] = useState(0);

  useEffect(() => {
    if (revealIndex >= rows.length) return;
    const row = rows[revealIndex];

    if (row.kind === "paid") {
      setRevealIndex((i) => i + 1);
      return;
    }

    const decision = decisionByRound.get(row.round);
    if (!decision) return;

    const f = reducedMotion ? 0 : 1;
    let cancelled = false;
    (async () => {
      setBeat(1);
      await wait(320 * f);
      if (cancelled) return;
      setBeat(2);
      await wait(700);
      if (cancelled) return;
      setBeat(3);
      await wait(420 * f);
      if (cancelled) return;
      setBeat(4);
      await wait(600 * f);
      if (cancelled) return;
      setBeat(0);
      setRevealIndex((i) => i + 1);
    })();
    return () => { cancelled = true; };
  }, [revealIndex, rows.length, decisionByRound, reducedMotion]);

  const revealed = rows.slice(0, revealIndex);
  const currentRow = rows[revealIndex];
  const currentDecision = currentRow && currentRow.kind === "rejected" ? decisionByRound.get(currentRow.round) : undefined;
  const pending =
    currentDecision && currentRow?.kind === "rejected" && beat > 0
      ? { decision: currentDecision, row: currentRow, beat }
      : null;

  return { revealed, pending };
}

function TimelineDot({ pulsing = false }: { pulsing?: boolean }) {
  return (
    <div
      className={`absolute top-1 -left-[calc(var(--spacing-lg)+5px)] h-[10px] w-[10px] rounded-full border border-line bg-base ${pulsing ? "animate-pulse" : ""}`}
      aria-hidden="true"
    />
  );
}

interface AttemptCardProps {
  row: Extract<TimelineRow, { kind: "paid" }>;
  previous?: TimelineRow;
  verificationEvent?: Extract<JobEvent, { type: "verification" }>;
}

function AttemptCard({ row, previous, verificationEvent }: AttemptCardProps) {
  const allPassed = row.passed === row.total;
  const noNewSignal = previous?.kind === "paid" && previous.passed === row.passed && previous.total === row.total;

  if (row.verified) {
    return (
      <div className="animate-scale-in rounded-xl bg-ink p-lg text-white shadow-lift">
        <div className="mb-lg flex items-center justify-between border-b border-white/15 pb-lg">
          <div className="flex items-center gap-sm">
            <span className="text-label uppercase text-faint">Final attempt</span>
            <Tag>{strategyLabel(row.strategyId)} Agent</Tag>
          </div>
          <span className="tabular font-mono text-faint">-{formatUsd(row.price)}</span>
        </div>
        <div className="mb-lg flex items-center justify-between">
          <span className="text-stat text-pass">Accepted</span>
          <span className="rounded-sm border border-pass-line bg-pass-dim/30 px-3 py-1 text-label uppercase text-pass">
            Honouring the outcome
          </span>
        </div>
        {verificationEvent && (
          <div className="mt-md grid grid-cols-2 gap-md rounded-lg border border-white/10 bg-white/5 p-md">
            <div>
              <p className="text-label uppercase text-faint">Visible tests</p>
              <p className="mt-xs tabular text-[24px] font-medium text-pass">{verificationEvent.visiblePassed}/{verificationEvent.visibleTotal}</p>
            </div>
            <div>
              <p className="text-label uppercase text-faint">Hidden verification</p>
              <p className="mt-xs tabular text-[24px] font-medium text-pass">{verificationEvent.hiddenPassed}/{verificationEvent.hiddenTotal}</p>
            </div>
          </div>
        )}
        <div className="mt-lg flex flex-col items-center gap-sm border-t border-white/15 pt-lg text-center">
          <span className="tabular text-price text-pass">{row.passed}/{row.total} passing</span>
          <span className="mt-xs flex items-center gap-xs rounded-sm border border-pass-line bg-pass-dim/30 px-4 py-2 text-pass uppercase font-medium">
            Verified
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`animate-scale-in rounded-xl border border-line bg-panel p-lg ${noNewSignal ? "opacity-70" : ""}`}>
      <div className="mb-md flex items-center justify-between">
        <div className="flex items-center gap-sm">
          <span className="text-label uppercase text-faint">Attempt {String(row.round).padStart(2, "0")}</span>
          <Tag>{strategyLabel(row.strategyId)} Agent</Tag>
        </div>
        <span className="tabular font-mono text-faint">-{formatUsd(row.price)}</span>
      </div>
      <div className="flex items-end justify-between gap-md">
        <div className="flex flex-col gap-xs">
          <span className="tabular text-[28px] font-medium">{row.passed}/{row.total} tests</span>
          {noNewSignal ? (
            <span className="w-fit rounded-sm border border-line bg-panel-3 px-2 py-1 text-label uppercase text-faint">
              No new signal
            </span>
          ) : (
            <span className={`text-label uppercase ${allPassed ? "text-pass" : "text-fail"}`}>
              {allPassed ? "" : "Incomplete"}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {Array.from({ length: row.total }).map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-sm ${
                i < row.passed ? "bg-pass" : "bg-panel-3"
              }`}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>
      {/*
       * No transaction id here, deliberately — this is the customer path,
       * and CLAUDE.md restricts settlement proof to the statement footer
       * ("no hashes... above the fold"). This row only confirms verification
       * ran; the receipt with the real txId lives on /statement.
       */}
      <div className="mt-md flex items-center justify-between text-meta text-faint">
        <span>x402 · 402 → signed → retried → facilitator verified</span>
        <span>{row.settledOnChain ? "Settled on Algorand Testnet" : "No on-chain settlement recorded"}</span>
      </div>
    </div>
  );
}

function RejectedRowCard({ row }: { row: Extract<TimelineRow, { kind: "rejected" }> }) {
  return (
    <div className="animate-scale-in flex items-center justify-between gap-md rounded-xl border-l-4 border border-line bg-panel-2 p-lg" style={{ borderLeftColor: "var(--color-fail)" }}>
      <div className="flex items-center gap-sm">
        <svg className="h-4 w-4 text-fail" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5 15L15 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
        <div className="flex flex-col">
          <div className="flex items-center gap-sm">
            <Tag>{strategyLabel(row.strategyId)} Agent</Tag>
            <span className="text-label uppercase text-fail">Rejected</span>
          </div>
          <p className="mt-xs text-body-sm text-mute">{row.reason}</p>
        </div>
      </div>
      <div className="flex flex-col items-end">
        <span className="tabular font-mono text-faint line-through decoration-fail/50">{formatUsd(row.price)}</span>
        <span className="text-label uppercase text-hold">Affordable</span>
      </div>
    </div>
  );
}

function RejectionSequence({
  decision,
  row,
  beat,
}: {
  decision: StepDecision;
  row: Extract<TimelineRow, { kind: "rejected" }>;
  beat: number;
}) {
  const rejected = decision.rejected.find((r) => r.strategyId === row.strategyId && r.price === row.price);
  if (!rejected) return null;
  const selected = decision.selected;

  const match = rejected.detail.match(/expected cost-to-success ([\$\d.]+) is worse than ([\$\d.]+) for (.+)/);
  const thisEcs = match ? parseFloat(match[1].replace("$", "")) : null;
  const altEcs = match ? parseFloat(match[2].replace("$", "")) : null;
  const altLabel = match ? match[3] : selected?.label ?? "Alternative";

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-line bg-panel p-lg shadow-card"
      role="status"
      aria-live="assertive"
    >
      <h3 className="mb-md text-label uppercase text-faint">Economic decision moment</h3>

      {beat >= 1 && (
        <div className="animate-scale-in mb-md rounded-lg border border-line bg-panel-2 p-md shadow-card">
          <span className="text-label uppercase text-faint">{strategyLabel(rejected.strategyId)} Agent requested</span>
          <p className="mt-xs tabular text-stat">{formatUsd(rejected.price)}</p>
        </div>
      )}

      {beat >= 2 && (
        <div className="animate-scale-in mb-md flex items-center gap-sm">
          <svg className="h-5 w-5 text-pass" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
            <path d="M5 8.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-body-sm font-medium text-pass">Available budget {formatUsd(decision.remainingBudgetBefore)} — Affordable</span>
        </div>
      )}

      {beat >= 3 && thisEcs !== null && altEcs !== null && (
        <div className="animate-scale-in mb-md rounded-lg border border-line bg-panel-2 p-md">
          <p className="text-label uppercase text-faint">Expected cost-to-success</p>
          <div className="mt-sm flex flex-col gap-sm">
            <Bar label={`${altLabel} Agent`} value={altEcs} max={Math.max(thisEcs, altEcs)} tone="accent" />
            <Bar label={`${strategyLabel(rejected.strategyId)} Agent`} value={thisEcs} max={Math.max(thisEcs, altEcs)} tone="fail" />
          </div>
        </div>
      )}

      {beat >= 4 && (
        <div className="animate-scale-in rounded-lg border border-fail-line bg-fail-dim p-md text-on-error-container">
          <div className="flex items-center gap-sm">
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 15L15 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            <span className="text-label uppercase">Rejected</span>
          </div>
          <p className="mt-1 text-body-sm">{rejected.reason}</p>
        </div>
      )}
    </div>
  );
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: "accent" | "fail" }) {
  const [shown, setShown] = useState(false);
  useEffect(() => { setShown(true); }, []);
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

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm border border-line bg-panel-3 px-2 py-0.5 font-mono text-[10px] text-mute">{children}</span>;
}

export type { JobOutcome };