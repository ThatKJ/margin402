import { STRATEGY_CATALOG, type StrategyDef, type StrategyId } from "@/lib/providers/strategies";
import type { PlanId } from "./types";

/**
 * The three plans are three orchestration ladders over the same strategy
 * catalog and the same economic engine.
 *
 *  - lowest-cost:       strict cheapest-first rung [s1 -> s2 -> s3]. Exactly one
 *                       tier active at a time; the next unlocks only when the
 *                       current one has no attempts left.
 *  - best-value:        every strategy with attempts remaining stays available;
 *                       the economics engine ranks them by expected
 *                       cost-to-success (canonical behaviour).
 *  - highest-confidence: reliability-first rung [s3 -> s2 -> s1]; strongest
 *                        provider always attempted before any fallback.
 *
 * Pure and deterministic so tests can assert ladder shape without paying.
 */
export function availableStrategiesForPlan(
  planId: PlanId,
  attemptsPerStrategy: Record<string, number>,
): StrategyDef[] {
  const withAttemptsLeft = STRATEGY_CATALOG.filter(
    (s) => (attemptsPerStrategy[s.id] ?? 0) < s.maxAttempts,
  );

  if (planId === "best-value") {
    return withAttemptsLeft;
  }

  const order: StrategyId[] =
    planId === "highest-confidence" ? ["s3", "s2", "s1"] : ["s1", "s2", "s3"];

  for (const id of order) {
    const rung = withAttemptsLeft.find((s) => s.id === id);
    if (rung) return [rung];
  }
  return [];
}
