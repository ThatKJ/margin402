import { describe, it, expect } from "vitest";
import { applyHonouringRule } from "../honouring";

describe("applyHonouringRule", () => {
  it("pays anyway when the loss from paying is smaller than the loss from refunding", () => {
    // The demo's final node: $0.23 already spent, S3 costs $1.05, revenue $1.20.
    const result = applyHonouringRule({ spentSoFar: 0.23, price: 1.05, revenue: 1.2 });

    expect(result.lossFromPaying).toBeCloseTo(0.08, 10);
    expect(result.lossFromRefunding).toBeCloseTo(1.43, 10);
    expect(result.lossFromPaying).toBeLessThan(result.lossFromRefunding);
    expect(result.decision).toBe("PAY_ANYWAY");
  });

  it("refunds when paying anyway would cost more than refunding", () => {
    const result = applyHonouringRule({ spentSoFar: 0.05, price: 5.0, revenue: 1.2 });

    expect(result.lossFromPaying).toBeCloseTo(3.85, 10);
    expect(result.lossFromRefunding).toBeCloseTo(1.25, 10);
    expect(result.decision).toBe("REFUND");
  });

  it("refunds on an exact tie (paying anyway must be strictly cheaper, not just as cheap)", () => {
    // price = 2 * revenue with nothing spent yet: lossFromPaying == lossFromRefunding == revenue.
    const result = applyHonouringRule({ spentSoFar: 0, price: 2.4, revenue: 1.2 });

    expect(result.lossFromPaying).toBe(result.lossFromRefunding);
    expect(result.decision).toBe("REFUND");
  });

  it("still prefers paying when it's outright profitable, not just less bad", () => {
    const result = applyHonouringRule({ spentSoFar: 0, price: 0.05, revenue: 1.2 });

    expect(result.lossFromPaying).toBeLessThan(0); // negative = profit
    expect(result.decision).toBe("PAY_ANYWAY");
  });
});
