import { describe, it, expect } from "vitest";
import { expectedCostToSuccess, rankStrategies } from "../expected-cost";
import type { Strategy } from "../types";

const S1: Strategy = { id: "s1", label: "Draft", price: 0.05, pSuccess: 0.35 };
const S2: Strategy = { id: "s2", label: "Repair", price: 0.09, pSuccess: 0.45 };
const S3 = (price: number): Strategy => ({ id: "s3", label: "Premium", price, pSuccess: 0.85 });

describe("expectedCostToSuccess", () => {
  it("reduces to price / pSuccess when it's the only option left (terminal case)", () => {
    expect(expectedCostToSuccess(S1, [S1])).toBeCloseTo(0.05 / 0.35, 10);
    expect(expectedCostToSuccess(S3(1.05), [S3(1.05)])).toBeCloseTo(1.05 / 0.85, 10);
  });

  it("is materially different from naive price/pSuccess once fallback options exist — this is the point of point 4", () => {
    const naive = S1.price / S1.pSuccess; // 0.142857...
    const withFallbacks = expectedCostToSuccess(S1, [S1, S2, S3(0.55)]);

    // The naive number only accounts for S1's own retries. The recursive
    // number correctly prices in that a *failed* S1 attempt doesn't throw
    // away the job — it falls through to whichever remaining strategy is
    // cheapest next, and that chain of possible follow-on spend is real
    // expected cost. It's more than double the naive figure here.
    expect(withFallbacks).toBeGreaterThan(naive * 2);
    expect(withFallbacks).toBeCloseTo(0.33982352941176475, 10);
  });

  it("ranks strategies by expected cost-to-success, cheapest first", () => {
    const ranked = rankStrategies([S1, S2, S3(0.55)]);
    expect(ranked.map((r) => r.strategyId)).toEqual(["s1", "s2", "s3"]);
  });

  it("caps recursion at depth 3 — a strategy reached exactly at the cap is scored by its own price/p, not by recursing further into its own fallbacks", () => {
    // Verified against a hand-written uncapped reference version of the same
    // recursion. The two provably differ, confirming the cap is actually
    // enforced (not silently ignored) — see the module's MAX_DEPTH constant.
    // Note: the terminal shortcut (price/p, "retry this exact strategy
    // forever") isn't a strict pessimistic bound relative to one more level
    // of lookahead — for an already cheap, reliable strategy it can beat a
    // shallow lookahead into a worse fallback set, which is exactly what
    // happens with "d" below. The only claim this test makes is that depth
    // matters at all, not which direction it moves the number.
    const chain: Strategy[] = [
      { id: "a", label: "A", price: 0.05, pSuccess: 0.3 },
      { id: "b", label: "B", price: 0.05, pSuccess: 0.3 },
      { id: "c", label: "C", price: 0.05, pSuccess: 0.3 },
      { id: "d", label: "D", price: 0.01, pSuccess: 0.99 },
      { id: "e", label: "E", price: 0.01, pSuccess: 0.99 },
    ];

    function uncapped(s: Strategy, remaining: Strategy[]): number {
      const rest = remaining.filter((x) => x.id !== s.id);
      if (rest.length === 0) return s.price / s.pSuccess;
      const bestRest = Math.min(...rest.map((s2) => uncapped(s2, rest)));
      return s.price + (1 - s.pSuccess) * bestRest;
    }

    const capped = expectedCostToSuccess(chain[0], chain);
    const reference = uncapped(chain[0], chain);

    expect(capped).toBeCloseTo(0.05707070707070708, 10);
    expect(reference).toBeCloseTo(0.05708166666666667, 10);
    expect(capped).not.toBeCloseTo(reference, 6);
  });
});
