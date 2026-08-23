import { toCents, toDollars, formatUsd } from "./money";
import type { OfferEvaluation, QuoteBreakdown } from "./types";

/**
 * Customer counteroffer evaluation. Below the reservation floor: decline
 * (the numbers compared are handed back, not just a verdict). At or above
 * the floor: accept, and operating margin compresses to whatever's left
 * after expectedCost and riskReserve are covered.
 */
export function evaluateOffer(offer: number, quote: QuoteBreakdown): OfferEvaluation {
  const offerC = toCents(offer);
  const floorC = toCents(quote.floor);
  const expectedCostC = toCents(quote.expectedCost);
  const riskReserveC = toCents(quote.riskReserve);

  const expectedCost = toDollars(expectedCostC);
  const riskReserve = toDollars(riskReserveC);
  const floor = toDollars(floorC);
  const offerDollars = toDollars(offerC);

  if (offerC < floorC) {
    const shortfall = toDollars(floorC - offerC);
    return {
      decision: "DECLINE",
      offer: offerDollars,
      floor,
      expectedCost,
      riskReserve,
      rationale:
        `Offer ${formatUsd(offerDollars)} is ${formatUsd(shortfall)} below the reservation floor ` +
        `${formatUsd(floor)} (expected cost ${formatUsd(expectedCost)} + risk reserve ${formatUsd(riskReserve)}). ` +
        `Declining avoids taking on an expected loss.`,
    };
  }

  const compressedOperatingMargin = toDollars(offerC - expectedCostC - riskReserveC);
  return {
    decision: "ACCEPT",
    offer: offerDollars,
    floor,
    expectedCost,
    riskReserve,
    compressedOperatingMargin,
    rationale:
      `Offer ${formatUsd(offerDollars)} is at or above the reservation floor ${formatUsd(floor)}. ` +
      `Accepting; operating margin compresses from the quoted amount to ${formatUsd(compressedOperatingMargin)}.`,
  };
}
