import { describe, it, expect } from "vitest";
import {
  createLedger,
  recordAttempt,
  executionCost,
  remainingBudget,
  realizedMargin,
  isVerified,
} from "../ledger";
import { decideNextStep } from "../engine";
import { evaluateOffer } from "../counteroffer";
import { LOCKED_QUOTE } from "../quote";
import { ECONOMIC_REJECTION_REASON } from "../selection";
import type { Strategy } from "../types";

const S1: Strategy = { id: "s1", label: "Draft", price: 0.05, pSuccess: 0.35 };
const S2: Strategy = { id: "s2", label: "Repair", price: 0.09, pSuccess: 0.45 };
const s3At = (price: number): Strategy => ({ id: "s3", label: "Premium", price, pSuccess: 0.85 });

describe("canonical demo scenario (CLAUDE.md)", () => {
  it("quotes $1.20, accepts a $1.05 counteroffer, and settles at a -$0.23 margin computed from the ledger", () => {
    // --- 1-3. Quote, then counteroffer. Revenue is fixed by the ACCEPTED
    // counteroffer from here on — never the raw $1.20 quote.
    expect(LOCKED_QUOTE.quote).toBe(1.2);
    expect(LOCKED_QUOTE.floor).toBe(0.77);

    const offer = evaluateOffer(1.05, LOCKED_QUOTE);
    expect(offer.decision).toBe("ACCEPT");

    const REVENUE = offer.offer; // $1.05 — point 4: exactly this, not $1.20.
    expect(REVENUE).toBe(1.05);
    let ledger = createLedger(REVENUE);

    // --- Round 1: Draft.
    expect(remainingBudget(ledger)).toBe(1.05);
    let step = decideNextStep(ledger, [S1, S2, s3At(0.55)]);
    expect(step.selected?.strategyId).toBe("s1");
    ledger = recordAttempt(ledger, { strategyId: "s1", price: S1.price, testsPassed: 5, testsTotal: 8 });
    expect(executionCost(ledger)).toBeCloseTo(0.05, 10);
    expect(remainingBudget(ledger)).toBeCloseTo(1.0, 10);

    // --- Round 2: Repair. Draft has no feedback loop, so it isn't offered again.
    step = decideNextStep(ledger, [S2, s3At(0.55)]);
    expect(step.selected?.strategyId).toBe("s2");
    ledger = recordAttempt(ledger, { strategyId: "s2", price: S2.price, testsPassed: 7, testsTotal: 8 });
    expect(executionCost(ledger)).toBeCloseTo(0.14, 10);
    // Point 5's own arithmetic, verified: $0.14 spent leaves $0.91 remaining.
    expect(remainingBudget(ledger)).toBeCloseTo(0.91, 10);

    // --- Round 3: the rejection beat. S3 requests $0.85.
    const budgetBeforeRound3 = remainingBudget(ledger);
    step = decideNextStep(ledger, [S2, s3At(0.85)]);
    expect(step.kind).toBe("PAY");
    expect(step.selected?.strategyId).toBe("s2");
    expect(step.rejected).toHaveLength(1);
    const rejectedS3 = step.rejected[0];
    expect(rejectedS3.strategyId).toBe("s3");
    // Point 5: $0.85 IS affordable against $0.91 remaining — this must never
    // be reachable via an "insufficient budget" code path.
    expect(rejectedS3.affordable).toBe(true);
    expect(0.85).toBeLessThanOrEqual(budgetBeforeRound3);
    expect(rejectedS3.expectedCostToSuccess).toBeGreaterThan(step.selected!.expectedCostToSuccess);
    // The exact required text, verbatim — not a paraphrase.
    expect(rejectedS3.reason).toBe("Payment rejected: economically inferior to available alternative.");
    expect(rejectedS3.reason).toBe(ECONOMIC_REJECTION_REASON);
    expect(rejectedS3.reason.toLowerCase()).not.toContain("budget");
    expect(rejectedS3.reason.toLowerCase()).not.toContain("insufficient");

    ledger = recordAttempt(ledger, { strategyId: "s2", price: S2.price, testsPassed: 7, testsTotal: 8 });
    expect(executionCost(ledger)).toBeCloseTo(0.23, 10);
    expect(remainingBudget(ledger)).toBeCloseTo(0.82, 10);

    // --- Round 4: the honouring beat. Repair has used both its tries and is
    // dropped; only Premium is left, now at CLAUDE.md's later price, $1.05.
    step = decideNextStep(ledger, [s3At(1.05)]);
    expect(step.selected?.strategyId).toBe("s3");
    expect(step.affordability?.affordable).toBe(false); // $1.05 > $0.82 remaining
    expect(step.honouring).toBeDefined();
    expect(step.honouring?.lossFromPaying).toBeCloseTo(0.23, 10);
    expect(step.honouring?.lossFromRefunding).toBeCloseTo(1.28, 10);
    expect(step.honouring?.decision).toBe("PAY_ANYWAY");
    expect(step.kind).toBe("PAY");
    ledger = recordAttempt(ledger, { strategyId: "s3", price: 1.05, testsPassed: 8, testsTotal: 8 });

    // --- 8. Final numbers, derived from the ledger — asserted only now,
    // and only as a sum over the four recordAttempt calls above.
    expect(isVerified(ledger)).toBe(true);
    expect(ledger.attempts.map((a) => a.price)).toEqual([0.05, 0.09, 0.09, 1.05]);
    expect(executionCost(ledger)).toBeCloseTo(1.28, 10);
    expect(REVENUE - executionCost(ledger)).toBeCloseTo(-0.23, 10);
    expect(realizedMargin(ledger)).toBeCloseTo(-0.23, 10);
  });

  it("produces a positive margin when Draft passes on the first try — the engine isn't hardcoded to lose", () => {
    const offer = evaluateOffer(1.05, LOCKED_QUOTE);
    let ledger = createLedger(offer.offer);

    const step = decideNextStep(ledger, [S1, S2, s3At(0.55)]);
    expect(step.selected?.strategyId).toBe("s1");
    ledger = recordAttempt(ledger, { strategyId: "s1", price: S1.price, testsPassed: 8, testsTotal: 8 });

    expect(isVerified(ledger)).toBe(true);
    expect(executionCost(ledger)).toBeCloseTo(0.05, 10);
    expect(realizedMargin(ledger)).toBeCloseTo(1.0, 10);
    expect(realizedMargin(ledger)).toBeGreaterThan(0);
  });

  it("refunds when every remaining strategy is exhausted", () => {
    const ledger = createLedger(1.05);
    const step = decideNextStep(ledger, []);
    expect(step.kind).toBe("NO_STRATEGIES_LEFT");
  });
});
