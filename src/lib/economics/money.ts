/**
 * All currency arithmetic in this module happens in integer cents, then
 * converts back to dollars at the boundary. Every dollar amount in CLAUDE.md's
 * locked economics is an exact multiple of $0.01, so this keeps sums exact
 * (1.20 - 1.28 in floating point is -0.08000000000000007, not -0.08 — that
 * gap is unacceptable in numbers a test asserts equality on, or that land on
 * a statement).
 *
 * Expected-cost-to-success values (money.ts callers in expected-cost.ts) are
 * NOT run through this — they're analytical/rationale numbers (a division by
 * a probability), not amounts anyone is ever charged, so fractional cents are
 * fine there.
 */

export function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function toDollars(cents: number): number {
  return cents / 100;
}

export function formatUsd(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}
