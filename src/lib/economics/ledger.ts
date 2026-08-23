import { toCents, toDollars } from "./money";
import type { AttemptRecord } from "./types";

/**
 * The transaction ledger a job's numbers emerge from. Nothing here is ever
 * asserted directly — executionCost and realizedMargin are always derived by
 * summing the attempts actually recorded.
 */
export interface Ledger {
  /** What the customer paid — the quote, or an accepted counteroffer. */
  revenue: number;
  attempts: AttemptRecord[];
}

export function createLedger(revenue: number): Ledger {
  return { revenue, attempts: [] };
}

export function recordAttempt(
  ledger: Ledger,
  args: { strategyId: string; price: number; testsPassed: number; testsTotal: number },
): Ledger {
  const attempt: AttemptRecord = { ...args, verified: args.testsPassed === args.testsTotal };
  return { ...ledger, attempts: [...ledger.attempts, attempt] };
}

export function attemptsUsed(ledger: Ledger, strategyId: string): number {
  return ledger.attempts.filter((a) => a.strategyId === strategyId).length;
}

/**
 * Sum of every payment actually made so far. This — not a stored total — is
 * where "execution cost" comes from; CLAUDE.md's statement screen calls this
 * "execution cost" and mid-job UI calls the same quantity subtracted from
 * revenue "budget remaining." Never label this function's result "margin"
 * while the job is still open.
 */
export function executionCost(ledger: Ledger): number {
  const totalC = ledger.attempts.reduce((sum, a) => sum + toCents(a.price), 0);
  return toDollars(totalC);
}

/**
 * revenue - executionCost. Mid-job this IS "budget remaining" (drains as
 * attempts are paid for). At job close it becomes the realized margin —
 * same formula, two different lifecycle labels; see realizedMargin below.
 */
export function remainingBudget(ledger: Ledger): number {
  return toDollars(toCents(ledger.revenue) - toCents(executionCost(ledger)));
}

/**
 * Only meaningful once the job is closed (verified or refunded) — the
 * customer-facing "Margin" on the statement. Numerically identical to
 * remainingBudget; kept as a separate, distinctly-named function because the
 * two must never share a UI label (CLAUDE.md: "Budget remaining" during
 * execution, "Margin" only on the statement).
 */
export function realizedMargin(ledger: Ledger): number {
  return remainingBudget(ledger);
}

export function isVerified(ledger: Ledger): boolean {
  return ledger.attempts.some((a) => a.verified);
}
