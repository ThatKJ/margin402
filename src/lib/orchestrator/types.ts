import type { StrategyId } from "@/lib/providers/strategies";
import type { TestFailure } from "@/lib/sandbox/types";
import type { StepDecision } from "@/lib/economics/types";
import type { Ledger } from "@/lib/economics/ledger";

export type PlanId = "lowest-cost" | "best-value" | "highest-confidence";

export interface ProviderCallArgs {
  strategyId: StrategyId;
  round: number;
  previousFailures?: TestFailure[];
}

export interface ProviderCallResult {
  code: string;
  price: number;
  txId?: string;
  settlementMs?: number;
}

export type ProviderClient = (args: ProviderCallArgs) => Promise<ProviderCallResult>;

export type JobOutcome = "VERIFIED" | "REFUNDED" | "FAILED";

export type JobEvent =
  | { type: "decision"; round: number; step: StepDecision }
  | {
      type: "payment";
      round: number;
      strategyId: StrategyId;
      price: number;
      txId?: string;
      settlementMs?: number;
    }
  | {
      type: "verification";
      round: number;
      strategyId: StrategyId;
      passed: number;
      total: number;
      verified: boolean;
      /** Counts only — never names, contents, or assertions. */
      visiblePassed: number;
      visibleTotal: number;
      hiddenPassed: number;
      hiddenTotal: number;
    }
  | {
      type: "closed";
      outcome: JobOutcome;
      revenue: number;
      executionCost: number;
      margin: number;
      finalCode?: string;
      /**
       * Every real settlement made this job, newest-last — a self-contained
       * receipt. A machine client can read this off the final SSE event
       * alone; it never needs to have buffered every prior `payment` event
       * to know what was actually paid. Real txIds only (from the same
       * `payment` events already streamed) — never invented, never
       * re-derived, and empty whenever no payment carried a txId (e.g.
       * in-process/demo mode, or a job that refunded before paying).
       */
      settlements: { strategyId: StrategyId; txId: string }[];
    };

export interface RunJobArgs {
  revenue: number;
  planId?: PlanId;
  providerClient: ProviderClient;
  /** Called synchronously right after each event is recorded — the UI's live stream hangs off this. */
  onEvent?: (event: JobEvent) => void;
  /**
   * Checked between rounds only — a payment already in flight when this
   * fires is allowed to settle (it's real money mid-transaction; aborting a
   * signed x402 payload doesn't unsend it), but no *new* round starts once
   * aborted. Set from the client disconnecting (refresh, tab close, network
   * drop) so an abandoned browser tab can't keep a real job spending
   * unbounded, unattended real testnet funds in the background.
   */
  signal?: AbortSignal;
}

export interface RunJobResult {
  outcome: JobOutcome;
  ledger: Ledger;
  events: JobEvent[];
  /** The candidate code from the attempt that verified, when outcome is VERIFIED. */
  finalCode?: string;
  error?: string;
}