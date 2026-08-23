import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runJob } from "../run-job";
import { createInProcessProviderClient } from "../provider-client";
import { priceForRound } from "@/lib/providers/price-curve";
import { ECONOMIC_REJECTION_REASON } from "@/lib/economics/selection";
import type { ProviderClient } from "../types";

/**
 * Real economics, real sandbox verifier, real demo-mode candidate
 * generation and price curve — the only thing swapped out is the
 * network/payment transport (real x402 + HTTP), which provider-client.ts
 * already implements for real and scripts/job-demo.ts exercises against a
 * funded wallet. A test suite that spends real testnet USDC on every run is
 * bad practice regardless of anything else; this proves the orchestration
 * state machine, not the payment rail (Prompt 1 already proved that one for real).
 */
const inProcessProviderClient = createInProcessProviderClient;

describe("runJob — canonical demo scenario, end to end", () => {
  const originalDemoMode = process.env.DEMO_MODE;
  beforeAll(() => {
    process.env.DEMO_MODE = "true";
  });
  afterAll(() => {
    process.env.DEMO_MODE = originalDemoMode;
  });

  it("reproduces the accepted-$1.05-counteroffer scenario: reject S3@$0.85 on economics, retry S2, accept S3@$1.05 under honouring, settle at -$0.23", async () => {
    const result = await runJob({ revenue: 1.05, providerClient: inProcessProviderClient() });

    expect(result.error).toBeUndefined();
    expect(result.outcome).toBe("VERIFIED");

    // The ledger is the source of truth — nothing here is asserted until
    // it's read back off what runJob actually recorded.
    expect(result.ledger.attempts.map((a) => a.strategyId)).toEqual(["s1", "s2", "s2", "s3"]);
    expect(result.ledger.attempts.map((a) => a.price)).toEqual([0.05, 0.09, 0.09, 1.05]);
    expect(result.ledger.attempts.map((a) => `${a.testsPassed}/${a.testsTotal}`)).toEqual([
      "5/8",
      "7/8",
      "7/8",
      "8/8",
    ]);

    const closed = result.events.find((e) => e.type === "closed");
    expect(closed).toMatchObject({
      type: "closed",
      outcome: "VERIFIED",
      revenue: 1.05,
    });
    if (closed?.type === "closed") {
      expect(closed.executionCost).toBeCloseTo(1.28, 10);
      expect(closed.margin).toBeCloseTo(-0.23, 10);
    }

    // Round 3: S3 requested at $0.85, rejected for economic reasons, not budget.
    const rejectionDecision = result.events.find(
      (e) => e.type === "decision" && e.step.rejected.some((r) => r.strategyId === "s3" && r.price === 0.85),
    );
    expect(rejectionDecision).toBeDefined();
    if (rejectionDecision?.type === "decision") {
      const rejected = rejectionDecision.step.rejected.find((r) => r.strategyId === "s3")!;
      expect(rejected.affordable).toBe(true);
      expect(rejected.reason).toBe(ECONOMIC_REJECTION_REASON);
      expect(rejectionDecision.step.selected?.strategyId).toBe("s2");
    }

    // Round 4: S3 at $1.05 accepted under the honouring rule (unaffordable, but cheaper than refunding).
    const honouringDecision = result.events.find((e) => e.type === "decision" && e.step.honouring !== undefined);
    expect(honouringDecision).toBeDefined();
    if (honouringDecision?.type === "decision") {
      expect(honouringDecision.step.honouring?.decision).toBe("PAY_ANYWAY");
      expect(honouringDecision.step.affordability?.affordable).toBe(false);
      expect(honouringDecision.step.selected?.strategyId).toBe("s3");
    }

    // Every payment event's price matches what the price curve says for that round.
    const payments = result.events.filter((e) => e.type === "payment");
    expect(payments).toHaveLength(4);
    for (const p of payments) {
      if (p.type === "payment") expect(p.price).toBe(priceForRound(p.strategyId, p.round));
    }
  });

  it("produces a positive margin when Draft passes first try, without touching S2 or S3", async () => {
    const providerClient: ProviderClient = async ({ strategyId, round }) => {
      const price = priceForRound(strategyId, round);
      if (strategyId === "s1") {
        // A trivially-correct parseDuration — proves the state machine
        // closes out immediately on a first-try pass, it isn't wired to
        // always run all four rounds.
        return {
          code: `
            function parseDuration(input) {
              const trimmed = String(input).trim();
              const negative = trimmed[0] === '-';
              const rest = negative ? trimmed.slice(1) : trimmed;
              const re = /(\\d+)([hms])/g;
              let m, total = 0, any = false, consumed = 0;
              while ((m = re.exec(rest)) !== null) {
                any = true; consumed += m[0].length;
                total += Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
              }
              if (!any || consumed !== rest.length) throw new Error('invalid');
              if (total > Number.MAX_SAFE_INTEGER) throw new RangeError('overflow');
              return negative ? -total : total;
            }
          `,
          price,
        };
      }
      throw new Error(`unexpected call to strategy ${strategyId} — Draft should have already closed the job`);
    };

    const result = await runJob({ revenue: 1.05, providerClient });

    expect(result.outcome).toBe("VERIFIED");
    expect(result.ledger.attempts).toHaveLength(1);
    expect(result.ledger.attempts[0].strategyId).toBe("s1");

    const closed = result.events.find((e) => e.type === "closed");
    if (closed?.type === "closed") {
      expect(closed.executionCost).toBeCloseTo(0.05, 10);
      expect(closed.margin).toBeGreaterThan(0);
      expect(closed.margin).toBeCloseTo(1.0, 10);
    }
  });

  it("never leaks a hidden-test failure into the next provider call's previousFailures", async () => {
    // Passes every visible test (hours/minutes, seconds, zero, negative,
    // whitespace, hours-only) and the hidden malformed-input test (throws
    // for non-matching input regardless), but has no overflow guard — so it
    // fails ONLY "integer overflow (nasty)", a hidden test. 7/8, one round
    // won't be enough, so the orchestrator will call the provider again —
    // that second call's previousFailures is what this test inspects.
    const CORRECT_CODE = `
      function parseDuration(input) {
        const trimmed = String(input).trim();
        if (trimmed.length === 0) throw new Error('empty');
        let negative = false;
        let rest = trimmed;
        if (rest[0] === '-') { negative = true; rest = rest.slice(1); }
        const re = /(\\d+)([hms])/g;
        let m, total = 0, any = false, consumed = 0;
        while ((m = re.exec(rest)) !== null) {
          any = true; consumed += m[0].length;
          total += Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
        }
        if (!any || consumed !== rest.length) throw new Error('invalid');
        if (total > Number.MAX_SAFE_INTEGER) throw new RangeError('overflow');
        return negative ? -total : total;
      }
    `;
    const MISSING_OVERFLOW_GUARD_CODE = CORRECT_CODE.replace(
      "if (total > Number.MAX_SAFE_INTEGER) throw new RangeError('overflow');",
      "",
    );

    const seen: unknown[][] = [];
    let call = 0;
    const providerClient: ProviderClient = async ({ strategyId, round, previousFailures }) => {
      seen.push(previousFailures ?? []);
      call += 1;
      const price = priceForRound(strategyId, round);
      return { code: call === 1 ? MISSING_OVERFLOW_GUARD_CODE : CORRECT_CODE, price };
    };

    const result = await runJob({ revenue: 1.05, providerClient });

    // Sanity: round 1 really did fail only the hidden test, so this test is
    // actually exercising the leak path and not passing vacuously.
    expect(result.ledger.attempts[0]).toMatchObject({ testsPassed: 7, testsTotal: 8 });

    // The real assertion: whatever the second call received as
    // previousFailures, it must not name the hidden test or repeat its
    // failure reason — empty, in this case, since the only failure was hidden.
    const secondCallFailures = seen[1] as { name: string; reason: string }[];
    expect(secondCallFailures).toEqual([]);
  });

  it("carries every real settlement on the final closed event, in order, without requiring the full event history", async () => {
    // A fake ProviderClient that hands back a distinct txId per call — proves
    // runJob aggregates the *same* txIds it already streamed on each
    // `payment` event, not a re-derived or invented list.
    let call = 0;
    const providerClient: ProviderClient = async ({ strategyId, round }) => {
      call += 1;
      const price = priceForRound(strategyId, round);
      if (strategyId === "s1") {
        return { code: "function parseDuration(){throw new Error('always fails')}", price, txId: `FAKE-TX-${call}` };
      }
      return {
        code: `
          function parseDuration(input) {
            const trimmed = String(input).trim();
            if (trimmed.length === 0) throw new Error('empty');
            let negative = false;
            let rest = trimmed;
            if (rest[0] === '-') { negative = true; rest = rest.slice(1); }
            const re = /(\\d+)([hms])/g;
            let m, total = 0, any = false, consumed = 0;
            while ((m = re.exec(rest)) !== null) {
              any = true; consumed += m[0].length;
              total += Number(m[1]) * (m[2] === 'h' ? 3600 : m[2] === 'm' ? 60 : 1);
            }
            if (!any || consumed !== rest.length) throw new Error('invalid');
            if (total > Number.MAX_SAFE_INTEGER) throw new RangeError('overflow');
            return negative ? -total : total;
          }
        `,
        price,
        txId: `FAKE-TX-${call}`,
      };
    };

    const result = await runJob({ revenue: 1.05, providerClient });
    expect(result.outcome).toBe("VERIFIED");

    const paymentTxIds = result.events
      .filter((e): e is Extract<typeof e, { type: "payment" }> => e.type === "payment")
      .map((e) => e.txId);

    const closed = result.events.find((e) => e.type === "closed");
    expect(closed?.type).toBe("closed");
    if (closed?.type === "closed") {
      expect(closed.settlements.map((s) => s.txId)).toEqual(paymentTxIds);
      expect(closed.settlements.length).toBeGreaterThan(0);
    }
  });

  it("reports an empty settlements list rather than an undefined one when no payment ever carried a txId", async () => {
    const result = await runJob({ revenue: 1.05, providerClient: inProcessProviderClient() });
    const closed = result.events.find((e) => e.type === "closed");
    expect(closed?.type).toBe("closed");
    if (closed?.type === "closed") {
      expect(closed.settlements).toEqual([]);
    }
  });

  it("refunds rather than continues when no strategy is affordable and honouring says refund", async () => {
    // A near-zero revenue means even Draft ($0.05) is unaffordable, and
    // refunding is cheaper than paying — the honouring rule must side with REFUND.
    const providerClient: ProviderClient = async () => {
      throw new Error("providerClient should never be called — nothing should be affordable");
    };
    const result = await runJob({ revenue: 0.01, providerClient });

    expect(result.outcome).toBe("REFUNDED");
    expect(result.ledger.attempts).toHaveLength(0);
  });
});
