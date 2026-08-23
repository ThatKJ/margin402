import { STRATEGY_CATALOG, type StrategyId } from "@/lib/providers/strategies";
import type { JobEvent, JobOutcome } from "@/lib/orchestrator/types";

/** Accepts any string (not just a known StrategyId) so it's safe to call directly on economics-engine fields, which are typed generically. */
export function strategyLabel(id: string): string {
  return STRATEGY_CATALOG.find((s) => s.id === id)?.label ?? id;
}

export interface PaidRow {
  kind: "paid";
  round: number;
  strategyId: StrategyId;
  price: number;
  passed: number;
  total: number;
  verified: boolean;
  /** True only when the payment event carried a real on-chain transaction id. */
  settledOnChain: boolean;
}

export interface RejectedRow {
  kind: "rejected";
  round: number;
  strategyId: StrategyId;
  price: number;
  reason: string;
  affordable: boolean;
}

export type TimelineRow = PaidRow | RejectedRow;

export interface ExecutionView {
  rows: TimelineRow[];
  spent: number;
  outcome: JobOutcome | null;
  executionCost: number;
  margin: number;
}

/**
 * Turns the raw JobEvent stream into what the Execution screen renders.
 * Pure and derived only from real events — nothing here invents state the
 * backend didn't report.
 *
 * Three UI-only judgment calls, made here so they're in one place:
 *  - Draft/Repair losing to each other is never rendered as a "rejection" —
 *    only Premium (s3) missing out is ever the story, in every version of
 *    this product's own spec.
 *  - Premium's own opening/base price is never shown as a rejection either
 *    — quoting it at list price and passing on cheaper options isn't a
 *    decision worth a beat. Only once its price has climbed past wherever
 *    it started does turning it down become the story. The threshold is
 *    the first price this run ever quoted for it, not a hardcoded dollar
 *    figure, so this holds if the underlying curve ever changes.
 *  - The same (strategy, price) rejection is only shown once, even if
 *    offered and turned down again in a later round at an unchanged price.
 */
export function deriveExecutionView(events: JobEvent[]): ExecutionView {
  const rows: TimelineRow[] = [];
  const seenRejections = new Set<string>();
  const pendingPayments = new Map<number, { strategyId: StrategyId; price: number; txId?: string }>();
  let s3BasePrice: number | null = null;
  let spent = 0;
  let outcome: JobOutcome | null = null;
  let executionCost = 0;
  let margin = 0;

  for (const event of events) {
    if (event.type === "decision") {
      for (const candidate of [event.step.selected, ...event.step.rejected]) {
        if (candidate?.strategyId === "s3" && s3BasePrice === null) {
          s3BasePrice = candidate.price;
        }
      }
      for (const r of event.step.rejected) {
        if (r.strategyId !== "s3") continue;
        if (s3BasePrice !== null && r.price <= s3BasePrice) continue;
        const key = `${r.strategyId}:${r.price}`;
        if (seenRejections.has(key)) continue;
        seenRejections.add(key);
        rows.push({
          kind: "rejected",
          round: event.round,
          strategyId: r.strategyId as StrategyId,
          price: r.price,
          reason: r.reason,
          affordable: r.affordable,
        });
      }
    }
    if (event.type === "payment") {
      spent += event.price;
      pendingPayments.set(event.round, { strategyId: event.strategyId, price: event.price, txId: event.txId });
    }
    if (event.type === "verification") {
      const pending = pendingPayments.get(event.round);
      if (pending) {
        rows.push({
          kind: "paid",
          round: event.round,
          strategyId: pending.strategyId,
          price: pending.price,
          passed: event.passed,
          total: event.total,
          verified: event.verified,
          settledOnChain: !!pending.txId,
        });
      }
    }
    if (event.type === "closed") {
      outcome = event.outcome;
      executionCost = event.executionCost;
      margin = event.margin;
    }
  }

  return { rows, spent, outcome, executionCost, margin };
}

/** The rejection row that should get the "strongest visual moment" treatment — the highest-priced one turned down. */
export function dramaticRejectionPrice(rows: TimelineRow[]): number | null {
  const prices = rows.filter((r): r is RejectedRow => r.kind === "rejected").map((r) => r.price);
  return prices.length ? Math.max(...prices) : null;
}
