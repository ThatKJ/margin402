"use server";

import { LOCKED_QUOTE } from "@/lib/economics/quote";
import { evaluateOfferForCustomer, type CustomerOfferResult } from "./customer-offer";

export type { CustomerOfferResult };

/**
 * The only economic logic here is the call into the real engine — this is
 * a thin server boundary, not a reimplementation. Sanitization (never leak
 * the reservation floor to the client) happens in customer-offer.ts, shared
 * with the machine-facing /api/quote route so both callers get the same guarantee.
 */
export async function submitCounteroffer(offer: number): Promise<CustomerOfferResult> {
  if (!Number.isFinite(offer) || offer < 0) {
    return { decision: "DECLINE", offer: 0, rationale: "Enter a valid positive dollar amount." };
  }
  return evaluateOfferForCustomer(offer, LOCKED_QUOTE);
}
