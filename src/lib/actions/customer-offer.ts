import { evaluateOffer } from "@/lib/economics/counteroffer";
import type { OfferDecision, QuoteBreakdown } from "@/lib/economics/types";

/**
 * What any client — the React UI or a machine calling the HTTP API — is
 * allowed to see. evaluateOffer()'s real OfferEvaluation carries `floor` as
 * a field AND states the exact floor dollar figure in its own `rationale`
 * prose ("...below the reservation floor $0.77..."). Correct for the pure
 * engine, which has no notion of what an outside caller should see, but
 * wrong to hand across any boundary a customer (human or machine) can
 * read — floor must never be exposed or hinted at anywhere the client can
 * read. This is that sanitizing boundary; the engine itself is untouched,
 * so its own tests keep asserting the full rationale.
 *
 * Neither branch states a dollar figure derived from expectedCost/
 * riskReserve, deliberately — the customer already knows their own `offer`
 * (they typed it), so ANY returned number of the form (floor - offer) or
 * (offer - floor) — an "expected loss" or a "compressed margin" — lets them
 * solve floor = that number ± offer with nothing more than arithmetic. Not
 * hypothetical: an earlier version of this function did exactly that and
 * reconstructed the real $0.77 floor from a single declined counteroffer.
 * See customer-offer.test.ts for the regression test.
 */
export interface CustomerOfferResult {
  decision: OfferDecision;
  offer: number;
  rationale: string;
  /** Set only on ACCEPT, by the caller (see quote-actions.ts / api/quote's route.ts) — the server-authoritative job this offer was accepted into. */
  jobId?: string;
}

export function evaluateOfferForCustomer(offer: number, quote: QuoteBreakdown): CustomerOfferResult {
  const evaluation = evaluateOffer(offer, quote);
  if (evaluation.decision === "DECLINE") {
    return {
      decision: "DECLINE",
      offer: evaluation.offer,
      rationale: "This offer would not cover the expected cost of completing the task.",
    };
  }
  return {
    decision: "ACCEPT",
    offer: evaluation.offer,
    rationale: "Offer accepted.",
  };
}
