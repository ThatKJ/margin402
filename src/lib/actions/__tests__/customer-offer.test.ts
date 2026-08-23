import { describe, it, expect } from "vitest";
import { evaluateOfferForCustomer } from "../customer-offer";
import { LOCKED_QUOTE } from "@/lib/economics/quote";

/**
 * The reservation floor ($0.77 for LOCKED_QUOTE) must never be exposed to a
 * customer — not as a field, not as a number an outside caller can derive.
 * The dangerous case isn't a literal `floor` field (that's the easy part to
 * avoid); it's a returned number of the form (floor - offer) or
 * (offer - floor), because the customer already knows their own `offer` —
 * they typed it — so a single arithmetic step recovers floor exactly. An
 * earlier version of evaluateOfferForCustomer did exactly this via
 * "expected loss" (DECLINE) and "compressed operating margin" (ACCEPT).
 */
describe("evaluateOfferForCustomer — reservation floor must not be reconstructible", () => {
  function allNumbers(value: unknown): number[] {
    const json = JSON.stringify(value);
    const matches = json.match(/-?\d+(\.\d+)?/g) ?? [];
    return matches.map(Number);
  }

  it("no offer, at any distance from the floor, yields a result number that combines with the offer to equal the floor", () => {
    // Below floor (DECLINE), exactly at floor, and comfortably above it (ACCEPT).
    const offers = [0.1, 0.5, 0.76, 0.77, 0.9, 1.05, 1.19];
    for (const offer of offers) {
      const result = evaluateOfferForCustomer(offer, LOCKED_QUOTE);
      const numbers = allNumbers(result);
      for (const n of numbers) {
        if (Math.abs(n - offer) < 1e-9) continue; // the offer itself, echoed back, is fine
        expect(Math.abs(offer - n) - LOCKED_QUOTE.floor).not.toBeCloseTo(0, 6);
        expect(Math.abs(n - offer) - LOCKED_QUOTE.floor).not.toBeCloseTo(0, 6);
      }
    }
  });

  it("the word floor/reservation and the raw quote breakdown never appear", () => {
    const declined = evaluateOfferForCustomer(0.5, LOCKED_QUOTE);
    const accepted = evaluateOfferForCustomer(1.05, LOCKED_QUOTE);
    for (const result of [declined, accepted]) {
      const json = JSON.stringify(result).toLowerCase();
      expect(json).not.toContain("floor");
      expect(json).not.toContain("reservation");
      expect(json).not.toContain("expectedcost");
      expect(json).not.toContain("riskreserve");
      expect(json).not.toContain("compressedoperatingmargin");
    }
  });

  it("still correctly decides ACCEPT/DECLINE at the exact floor boundary", () => {
    expect(evaluateOfferForCustomer(LOCKED_QUOTE.floor, LOCKED_QUOTE).decision).toBe("ACCEPT");
    expect(evaluateOfferForCustomer(LOCKED_QUOTE.floor - 0.01, LOCKED_QUOTE).decision).toBe("DECLINE");
  });
});
