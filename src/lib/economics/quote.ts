import { toCents, toDollars } from "./money";
import type { QuoteBreakdown } from "./types";

/**
 * Deterministic quote calculation: expectedCost + riskReserve + operatingMargin
 * = quote. floor = expectedCost + riskReserve (the reservation floor used by
 * evaluateOffer). This is a quote-time, blended estimate set by the pricing
 * process — distinct from the live, per-strategy expectedCostToSuccess used
 * during execution (see expected-cost.ts). Nothing requires the two to match.
 */
export function computeQuote(
  expectedCost: number,
  riskReserve: number,
  operatingMargin: number,
): QuoteBreakdown {
  const expectedCostC = toCents(expectedCost);
  const riskReserveC = toCents(riskReserve);
  const operatingMarginC = toCents(operatingMargin);
  const floorC = expectedCostC + riskReserveC;
  const quoteC = floorC + operatingMarginC;

  return {
    expectedCost: toDollars(expectedCostC),
    riskReserve: toDollars(riskReserveC),
    operatingMargin: toDollars(operatingMarginC),
    quote: toDollars(quoteC),
    floor: toDollars(floorC),
  };
}

/** CLAUDE.md's locked quote: $0.42 + $0.35 + $0.43 = $1.20, floor $0.77. */
export const LOCKED_QUOTE: QuoteBreakdown = computeQuote(0.42, 0.35, 0.43);
