import { describe, it, expect } from "vitest";
import { evaluateOffer } from "../counteroffer";
import { LOCKED_QUOTE } from "../quote";

describe("evaluateOffer", () => {
  it("declines an offer below the reservation floor", () => {
    const result = evaluateOffer(0.3, LOCKED_QUOTE);

    expect(result.decision).toBe("DECLINE");
    expect(result.floor).toBe(0.77);
    expect(result.offer).toBe(0.3);
    expect(result.compressedOperatingMargin).toBeUndefined();
    expect(result.rationale).toContain("0.30");
    expect(result.rationale).toContain("0.77");
  });

  it("accepts an offer at or above the reservation floor, compressing margin", () => {
    const result = evaluateOffer(1.05, LOCKED_QUOTE);

    expect(result.decision).toBe("ACCEPT");
    // 1.05 - 0.42 (expectedCost) - 0.35 (riskReserve) = 0.28, compressed from the quoted 0.43.
    expect(result.compressedOperatingMargin).toBeCloseTo(0.28, 10);
    expect(result.compressedOperatingMargin).toBeLessThan(LOCKED_QUOTE.operatingMargin);
  });

  it("accepts exactly at the floor, compressing operating margin to zero", () => {
    const result = evaluateOffer(0.77, LOCKED_QUOTE);

    expect(result.decision).toBe("ACCEPT");
    expect(result.compressedOperatingMargin).toBe(0);
  });

  it("accepts the full quote unchanged", () => {
    const result = evaluateOffer(1.2, LOCKED_QUOTE);

    expect(result.decision).toBe("ACCEPT");
    expect(result.compressedOperatingMargin).toBe(LOCKED_QUOTE.operatingMargin);
  });
});
