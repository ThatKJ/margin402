import { toCents, formatUsd } from "./money";
import { rankStrategies } from "./expected-cost";
import type { Strategy, StrategyRanking, RejectedCandidate } from "./types";

export interface SelectionResult {
  selected: StrategyRanking;
  rejected: RejectedCandidate[];
}

/** Fixed text for every economic rejection — never a budget explanation. */
export const ECONOMIC_REJECTION_REASON = "Payment rejected: economically inferior to available alternative.";

/**
 * Selects the strategy that minimises expected cost-to-success. Affordability
 * is deliberately NOT considered here — that's a separate, second check
 * (see affordability.ts) applied by the caller after selection, so the
 * engine can decline something it could actually afford. `remainingBudget`
 * is only used to annotate rejected candidates with whether they, too, were
 * affordable — proving a rejection was economic, not budget-driven, which is
 * why every rejection here carries ECONOMIC_REJECTION_REASON verbatim rather
 * than a wording that could be misread as an affordability complaint.
 */
export function selectStrategy(remaining: Strategy[], remainingBudget: number): SelectionResult {
  if (remaining.length === 0) {
    throw new Error("selectStrategy called with no remaining strategies");
  }
  const budgetC = toCents(remainingBudget);
  const ranked = rankStrategies(remaining);
  const [selected, ...rest] = ranked;

  const rejected: RejectedCandidate[] = rest.map((r) => ({
    ...r,
    affordable: toCents(r.price) <= budgetC,
    reason: ECONOMIC_REJECTION_REASON,
    detail:
      `expected cost-to-success ${formatUsd(r.expectedCostToSuccess)} is worse than ` +
      `${formatUsd(selected.expectedCostToSuccess)} for ${selected.label}`,
  }));

  return { selected, rejected };
}
