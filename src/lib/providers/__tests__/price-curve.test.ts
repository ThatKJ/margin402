import { describe, it, expect } from "vitest";
import { priceForRound } from "../price-curve";

describe("priceForRound (simulated demo price curve)", () => {
  it("keeps Draft and Repair flat across every round", () => {
    for (const round of [1, 2, 3, 4, 5]) {
      expect(priceForRound("s1", round)).toBe(0.05);
      expect(priceForRound("s2", round)).toBe(0.09);
    }
  });

  it("escalates Premium exactly per CLAUDE.md's locked curve: $0.55 -> $0.85 -> $1.05", () => {
    expect(priceForRound("s3", 1)).toBe(0.55);
    expect(priceForRound("s3", 2)).toBe(0.55);
    expect(priceForRound("s3", 3)).toBe(0.85);
    expect(priceForRound("s3", 4)).toBe(1.05);
    expect(priceForRound("s3", 5)).toBe(1.05); // stays at the final tier
  });
});
