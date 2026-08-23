import type { Strategy, StrategyRanking } from "./types";

/** Recursion cap — matches the terminal condition in CLAUDE.md's formula. */
const MAX_DEPTH = 3;

/**
 * Expected cost-to-success for `strategy`, given the other strategies still
 * available if it fails. This is NOT price / pSuccess (that ignores that a
 * failed attempt still leaves cheaper fallback options on the table) — it's:
 *
 *   E(s | R) = price(s) + (1 - pSuccess(s)) * min over s' in R\{s} of E(s' | R\{s})
 *   terminal (depth 3, or R\{s} empty):  price(s) / pSuccess(s)
 *
 * Prices are taken at their current quoted value and assumed to persist —
 * this never forecasts that a spike will revert.
 */
export function expectedCostToSuccess(strategy: Strategy, remaining: Strategy[], depth = 1): number {
  const rest = remaining.filter((s) => s.id !== strategy.id);
  if (depth >= MAX_DEPTH || rest.length === 0) {
    return strategy.price / strategy.pSuccess;
  }
  const bestRest = Math.min(...rest.map((s) => expectedCostToSuccess(s, rest, depth + 1)));
  return strategy.price + (1 - strategy.pSuccess) * bestRest;
}

/** Every available strategy, ranked cheapest-expected-cost-to-success first. */
export function rankStrategies(remaining: Strategy[]): StrategyRanking[] {
  return remaining
    .map((s) => ({
      strategyId: s.id,
      label: s.label,
      price: s.price,
      pSuccess: s.pSuccess,
      expectedCostToSuccess: expectedCostToSuccess(s, remaining),
    }))
    .sort((a, b) => a.expectedCostToSuccess - b.expectedCostToSuccess);
}
