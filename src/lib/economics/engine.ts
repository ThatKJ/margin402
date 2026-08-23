import { formatUsd } from "./money";
import { selectStrategy } from "./selection";
import { checkAffordability } from "./affordability";
import { applyHonouringRule } from "./honouring";
import { executionCost, remainingBudget, type Ledger } from "./ledger";
import type { Strategy, StepDecision } from "./types";

/**
 * The single decision point: given a ledger (revenue + attempts so far) and
 * the strategies currently available to try, decide what happens next.
 *
 * `available` is supplied by the caller, not derived here — which
 * strategies still make sense to retry (a feedback-free draft is pointless
 * to repeat; a repair pass with fresh failing tests isn't) is an
 * orchestration policy, not an economics one. This module only answers "of
 * what's available right now, at its current quoted price, what's the right
 * call" — see scenario tests for how a caller scripts availability over a
 * job's lifetime.
 *
 * Order of operations, each a separate check:
 *   1. Select the strategy with the lowest expected cost-to-success.
 *   2. Check whether it's affordable within the remaining budget.
 *   3. If not, apply the honouring rule to decide PAY_ANYWAY vs REFUND.
 */
export function decideNextStep(ledger: Ledger, available: Strategy[]): StepDecision {
  const budget = remainingBudget(ledger);

  if (available.length === 0) {
    return {
      kind: "NO_STRATEGIES_LEFT",
      rejected: [],
      remainingBudgetBefore: budget,
      rationale: "No strategies remain available to try.",
    };
  }

  const { selected, rejected } = selectStrategy(available, budget);
  const affordability = checkAffordability(selected.price, budget);

  if (affordability.affordable) {
    return {
      kind: "PAY",
      selected,
      rejected,
      affordability,
      remainingBudgetBefore: budget,
      rationale:
        `Selected ${selected.label} at ${formatUsd(selected.price)}: lowest expected cost-to-success ` +
        `(${formatUsd(selected.expectedCostToSuccess)}) among ${available.length} available ` +
        `${available.length === 1 ? "strategy" : "strategies"}, and affordable within ${formatUsd(budget)} remaining.`,
    };
  }

  const honouring = applyHonouringRule({
    spentSoFar: executionCost(ledger),
    price: selected.price,
    revenue: ledger.revenue,
  });

  return {
    kind: honouring.decision === "PAY_ANYWAY" ? "PAY" : "REFUND",
    selected,
    rejected,
    affordability,
    honouring,
    remainingBudgetBefore: budget,
    rationale: honouring.rationale,
  };
}
