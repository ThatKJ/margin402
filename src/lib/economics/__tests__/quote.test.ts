import { describe, it, expect } from "vitest";
import { computeQuote, LOCKED_QUOTE } from "../quote";

describe("computeQuote", () => {
  it("reconciles CLAUDE.md's locked components to a $1.20 quote with a $0.77 floor", () => {
    const quote = computeQuote(0.42, 0.35, 0.43);

    expect(quote.expectedCost).toBe(0.42);
    expect(quote.riskReserve).toBe(0.35);
    expect(quote.operatingMargin).toBe(0.43);
    expect(quote.expectedCost + quote.riskReserve + quote.operatingMargin).toBe(1.2);
    expect(quote.quote).toBe(1.2);
    expect(quote.floor).toBe(0.77);
  });

  it("exposes the locked quote as a ready-made constant", () => {
    expect(LOCKED_QUOTE.quote).toBe(1.2);
    expect(LOCKED_QUOTE.floor).toBe(0.77);
  });

  it("stays exact in cents regardless of floating-point component inputs", () => {
    // 0.1 + 0.2 is the canonical float trap (0.30000000000000004).
    const quote = computeQuote(0.1, 0.2, 0.05);
    expect(quote.quote).toBe(0.35);
    expect(quote.floor).toBe(0.3);
  });
});
