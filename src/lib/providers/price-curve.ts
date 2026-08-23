import type { StrategyId } from "./strategies";

/**
 * SIMULATED demo price curve. This is scripted, deterministic, and NOT a
 * real third-party market — it must never be presented as one anywhere
 * (UI, logs, docs). See CLAUDE.md's UI direction: any surface showing these
 * prices carries this exact label.
 */
export const SIMULATED_MARKET_LABEL = "simulated provider market";

/**
 * round is the orchestrator's 1-indexed job-round counter, incremented once
 * per decision point regardless of which strategy is actually selected.
 * Both the x402 route (stateless, no notion of "job") and the orchestrator
 * call this same function with the same round number, so client and server
 * agree on price without a live quote round-trip.
 *
 * S1/S2 are flat. S3 (Premium) escalates round over round — CLAUDE.md's
 * locked curve: $0.55 list price, spikes to $0.85, then $1.05.
 */
export function priceForRound(strategyId: StrategyId, round: number): number {
  switch (strategyId) {
    case "s1":
      return 0.05;
    case "s2":
      return 0.09;
    case "s3":
      if (round <= 2) return 0.55;
      if (round === 3) return 0.85;
      return 1.05;
  }
}
