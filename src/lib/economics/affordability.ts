import { toCents, toDollars } from "./money";
import type { AffordabilityCheck } from "./types";

/**
 * The second, separate check after selection: can Margin402 actually pay
 * for the strategy it just picked? Kept apart from selectStrategy on
 * purpose — selection must be able to pick something, and this must be able
 * to veto it, independently.
 */
export function checkAffordability(price: number, remainingBudget: number): AffordabilityCheck {
  const priceC = toCents(price);
  const budgetC = toCents(remainingBudget);
  return {
    affordable: priceC <= budgetC,
    price: toDollars(priceC),
    remainingBudget: toDollars(budgetC),
  };
}
