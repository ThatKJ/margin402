"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { deriveExecutionView, strategyLabel } from "@/lib/ui/derive";
import { formatUsd } from "@/lib/ui/format";
import { useCountUp, wait, usePrefersReducedMotion } from "@/lib/ui/motion";
import { useJob } from "@/lib/state/job-context";
import type { JobEvent } from "@/lib/orchestrator/types";
import { Button } from "@/components/primitives/Button";
import { Badge } from "@/components/primitives/Badge";
import { CopyField } from "@/components/primitives/CopyField";

type RevealStage = "revenue" | "cost" | "margin" | "verdict" | "done";
const STAGE_ORDER: RevealStage[] = ["revenue", "cost", "margin", "verdict", "done"];

export function StatementScreen() {
  const router = useRouter();
  const { revenue, events, outcome, startedAt, endedAt, reset } = useJob();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (outcome === null) router.replace("/quote");
  }, [outcome, router]);

  const view = useMemo(() => deriveExecutionView(events), [events]);
  const closedEvent = [...events].reverse().find((e): e is Extract<JobEvent, { type: "closed" }> => e.type === "closed");
  const finalCode = closedEvent?.finalCode;
  const finalVerification = [...events].reverse().find((e): e is Extract<JobEvent, { type: "verification" }> => e.type === "verification" && e.verified);
  const settlements = events.filter((e): e is Extract<JobEvent, { type: "payment" }> => e.type === "payment" && !!e.txId);
  const facilitatorHost = "GoPlausible";

  const [stage, setStage] = useState<RevealStage>("revenue");
  useEffect(() => {
    if (outcome === null) return;
    let cancelled = false;
    const f = reducedMotion ? 0 : 1;
    (async () => {
      await wait(200 * f);
      if (cancelled) return;
      setStage("cost");
      await wait(500 * f);
      if (cancelled) return;
      setStage("margin");
      await wait(1000);
      if (cancelled) return;
      setStage("verdict");
      await wait(500 * f);
      if (cancelled) return;
      setStage("done");
    })();
    return () => { cancelled = true; };
  }, [outcome]);

  const stageIndex = STAGE_ORDER.indexOf(stage);
  const marginTarget = stageIndex >= STAGE_ORDER.indexOf("margin") ? view.margin : 0;
  const revenueDisplay = useCountUp(revenue ?? 0, 700);
  const costDisplay = useCountUp(stageIndex >= STAGE_ORDER.indexOf("cost") ? view.executionCost : 0, 700);
  const marginDisplay = useCountUp(marginTarget, 1000);

  if (outcome === null || revenue === null) return null;

  const durationMs = startedAt && endedAt ? endedAt - startedAt : null;

  function handleDownloadReceipt() {
    const receipt = {
      task: "parseDuration",
      outcome,
      revenue,
      executionCost: view.executionCost,
      margin: view.margin,
      attempts: view.rows.map((r) => ({
        strategy: strategyLabel(r.strategyId),
        price: r.kind === "rejected" ? 0 : r.price,
        result: r.kind === "rejected" ? "rejected" : `${r.passed}/${r.total}`,
      })),
      settlements: settlements.map((s) => ({ strategy: strategyLabel(s.strategyId), txId: s.txId, network: "algorand-testnet" })),
      generatedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "margin402-receipt.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="mx-auto w-full max-w-[1100px] px-margin-mobile pt-28 pb-section md:px-margin-desktop md:pt-32">
      <header className="flex flex-col gap-xl md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-sm">
          <div className="flex items-center gap-sm text-label uppercase text-faint">
            <span className="h-1.5 w-1.5 rounded-full bg-pass" aria-hidden="true" />
            Statement
            <span className="h-1 w-1 rounded-full bg-line-strong" aria-hidden="true" />
            x402 settlement
          </div>
          <h1 className="mt-2 text-price text-ink">
            {outcome === "VERIFIED" ? "Verified outcome" : outcome === "REFUNDED" ? "Refunded" : "Job failed"}
          </h1>
        </div>
        <div className="flex flex-col gap-xs text-right md:w-64">
          <div className="flex items-center justify-end gap-sm">
            <Badge tone={outcome === "VERIFIED" ? "pass" : outcome === "REFUNDED" ? "hold" : "fail"}>
              {outcome}
            </Badge>
          </div>
          <div className="mt-2 flex flex-col gap-1 font-mono text-data text-faint">
            <MetaRow label="Duration" value={durationMs !== null ? `${durationMs}ms` : "—"} />
            <MetaRow label="Constraints" value={finalVerification ? `${finalVerification.passed}/${finalVerification.total} pass` : `${view.rows.filter((r) => r.kind === "paid").at(-1)?.passed ?? 0}/8`} />
            <MetaRow label="Timestamp" value={endedAt ? new Date(endedAt).toISOString() : "—"} />
          </div>
        </div>
      </header>

      <section className="mt-lg grid grid-cols-1 gap-sm md:grid-cols-4">
        <StatCard label="Revenue" value={formatUsd(revenueDisplay)} sub="Inbound yield" />
        <StatCard label="Execution cost" value={formatUsd(costDisplay)} sub="Total compute" show={stageIndex >= STAGE_ORDER.indexOf("cost")} />
        <StatCard label="Ext. inference" value="—" sub="Not tracked" muted />
        <StatCard
          label="Margin"
          value={formatUsd(marginDisplay)}
          sub="Net outcome"
          show={stageIndex >= STAGE_ORDER.indexOf("margin")}
          negative={view.margin < 0}
          emphasize
        />
      </section>

      {stageIndex >= STAGE_ORDER.indexOf("verdict") && (
        <p className="mt-sm animate-scale-in text-body text-mute max-w-2xl">
          {view.margin < 0
            ? "Margin402 absorbed the execution loss and delivered the guaranteed outcome."
            : "The verified outcome was reached for less than the customer paid."}
        </p>
      )}

      <section className="mt-xl flex flex-col gap-xl lg:flex-row lg:items-start">
        <div className="flex flex-col gap-lg lg:w-[68%]">
          <h2 className="text-title">Cost breakdown</h2>
          <div className="rounded-xl border border-line bg-panel overflow-hidden shadow-card">
            <div className="grid grid-cols-12 gap-px bg-line px-md py-sm text-label uppercase text-faint">
              <div className="col-span-2">Attempt</div>
              <div className="col-span-6">Strategy</div>
              <div className="col-span-4 text-right">Cost</div>
            </div>
            {view.rows.map((row, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-px bg-panel px-md py-sm hover:bg-panel-2 transition-colors">
                <div className="col-span-2 font-mono text-[12px] text-faint">{String(i + 1).padStart(2, "0")}</div>
                <div className="col-span-6 truncate text-ink">
                  {strategyLabel(row.strategyId)}
                  {row.kind === "rejected" && <span className="ml-2 text-label uppercase text-fail">Rejected</span>}
                </div>
                <div className="col-span-4 text-right font-mono text-ink">{formatUsd(row.kind === "rejected" ? 0 : row.price)}</div>
              </div>
            ))}
            <div className="grid grid-cols-12 items-center gap-px border-t border-line bg-panel-2 px-md py-sm">
              <div className="col-span-8 text-label uppercase text-faint">Total execution</div>
              <div className="col-span-4 text-right tabular font-semibold">{formatUsd(view.executionCost)}</div>
            </div>
          </div>

          {finalCode && (
            <div className="mt-xl">
              <h3 className="mb-sm text-label uppercase text-faint">Delivered code</h3>
              <pre className="tabular overflow-x-auto rounded-xl border border-line bg-well p-md text-[12px] leading-relaxed">{finalCode.trim()}</pre>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-xl lg:w-[32%] lg:sticky lg:top-28">
          <div className="rounded-xl border border-line bg-ink p-lg text-white shadow-lift">
            <h3 className="max-w-[90%] text-headline leading-tight font-medium">
              Margin402 doesn&apos;t guarantee profit.
              <br />
              <span className="opacity-60">It guarantees the outcome.</span>
            </h3>
          </div>

{settlements.length > 0 && (
              <div className="rounded-xl border border-line bg-panel shadow-card">
                <h3 className="mb-sm text-label uppercase text-faint p-md border-b border-line">Settlement receipt</h3>
                <div className="p-md space-y-md">
                  <ReceiptRow label="Network" value="Algorand Testnet" />
                  <ReceiptRow label="Asset" value="USDC (ASA 10458941)" />
                  <ReceiptRow label="Facilitator" value={facilitatorHost} />
                  <ReceiptRow label="Status" value="Settled" tone="pass" />
                  {(() => {
                    const lastTx = settlements[settlements.length - 1];
                    if (!lastTx?.txId) return null;
                    return <ReceiptRow label="Transaction" value={<CopyField value={lastTx.txId} label={lastTx.txId.slice(0, 12)} />} />;
                  })()}
                </div>
              </div>
            )}

          {settlements.length === 0 && (
            <div className="rounded-xl border border-line bg-panel shadow-card">
              <h3 className="mb-sm text-label uppercase text-faint p-md border-b border-line">Settlement</h3>
              <div className="p-md space-y-md">
                <p className="text-body-sm text-mute">No on-chain settlement recorded for this run.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      <footer className="mt-xl flex flex-col items-start justify-between gap-md border-t border-line pt-lg md:flex-row md:items-center">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <FooterMeta label="Protocol" value="x402" />
          <FooterMeta label="Network" value="Algorand Testnet" />
          <FooterMeta label="Settlement" value={settlements.length > 0 ? "Confirmed" : "No settlement recorded"} />
          <FooterMeta label="Verification" value="Independent" />
          {settlements.length > 0 && <FooterMeta label="Transaction" value={truncateTxId(settlements[settlements.length - 1].txId!)} />}
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-sm">
          <Button variant="secondary" onClick={handleDownloadReceipt}>
            Download receipt
          </Button>
          <Button variant="ghost" onClick={() => { reset(); router.push("/quote"); }}>
            New task
          </Button>
        </div>
      </footer>
    </section>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-md"><span>{label}</span><span className="font-semibold text-ink">{value}</span></div>;
}

function FooterMeta({ label, value }: { label: string; value: string }) {
  return <div className="flex flex-col gap-1"><span className="text-label uppercase text-faint">{label}</span><span className="font-mono text-data text-ink">{value}</span></div>;
}

function ReceiptRow({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "pass" | "fail" | "hold" }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-xs">
      <span className="text-label uppercase text-faint">{label}</span>
      <span className={`font-mono text-data ${tone === "pass" ? "text-pass" : tone === "fail" ? "text-fail" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  show = true,
  negative = false,
  emphasize = false,
  muted = false,
}: {
  label: string;
  value: string;
  sub: string;
  show?: boolean;
  negative?: boolean;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-line bg-panel p-lg shadow-card transition-shadow hover:shadow-lift ${emphasize && negative ? "border-fail-line bg-fail-dim" : ""}`}>
      <p className="text-label uppercase text-faint">{label}</p>
      <div className={`mt-sm flex flex-col transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}>
        <p className={`tabular text-stat ${muted ? "text-faint" : negative && emphasize ? "text-fail" : "text-ink"}`}>{value}</p>
        <p className="mt-1 font-mono text-meta text-faint">{sub.toUpperCase()}</p>
      </div>
    </div>
  );
}

function truncateTxId(txId: string): string {
  if (txId.length <= 14) return txId;
  return `${txId.slice(0, 6)}…${txId.slice(-6)}`;
}