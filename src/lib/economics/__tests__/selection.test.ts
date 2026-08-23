import { describe, it, expect } from "vitest";
import { selectStrategy, ECONOMIC_REJECTION_REASON } from "../selection";
import type { Strategy } from "../types";

const S2: Strategy = { id: "s2", label: "Repair", price: 0.09, pSuccess: 0.45 };
const S3_AT_085: Strategy = { id: "s3", label: "Premium", price: 0.85, pSuccess: 0.85 };

describe("selectStrategy", () => {
  it("rejects the demo's S3-at-$0.85 request in favor of S2, and flags it as affordable anyway", () => {
    // Remaining budget at this point in the canonical demo (revenue is the
    // accepted $1.05 counteroffer, not the raw $1.20 quote): 1.05 - 0.14 = 0.91.
    const { selected, rejected } = selectStrategy([S2, S3_AT_085], 0.91);

    expect(selected.strategyId).toBe("s2");
    expect(rejected).toHaveLength(1);
    expect(rejected[0].strategyId).toBe("s3");
    // The whole point of the demo beat: rejected for worse expected cost,
    // NOT because it couldn't be paid for. The reason text must say exactly
    // that — never anything that reads as a budget complaint — and the
    // numbers backing it up live in `detail`.
    expect(rejected[0].affordable).toBe(true);
    expect(rejected[0].expectedCostToSuccess).toBeGreaterThan(selected.expectedCostToSuccess);
    expect(rejected[0].reason).toBe(ECONOMIC_REJECTION_REASON);
    expect(rejected[0].reason).toBe("Payment rejected: economically inferior to available alternative.");
    expect(rejected[0].reason.toLowerCase()).not.toContain("budget");
    expect(rejected[0].reason.toLowerCase()).not.toContain("insufficient");
    expect(rejected[0].detail).toContain("expected cost-to-success");
  });

  it("flags a rejected candidate as unaffordable when it genuinely is", () => {
    const { rejected } = selectStrategy([S2, S3_AT_085], 0.5); // less than $0.85
    expect(rejected[0].affordable).toBe(false);
  });

  it("throws on an empty candidate list rather than silently returning nothing", () => {
    expect(() => selectStrategy([], 1)).toThrow();
  });
});
