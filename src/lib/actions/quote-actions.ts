"use server";

import { LOCKED_QUOTE } from "@/lib/economics/quote";
import { evaluateOfferForCustomer, type CustomerOfferResult } from "./customer-offer";
import { createJob } from "@/lib/state/job-store";
import { buildPlans } from "@/lib/economics/plans";
import type { PlanId } from "@/lib/orchestrator/types";

export type { CustomerOfferResult };

/**
 * The only economic logic here is the call into the real engine — this is
 * a thin server boundary, not a reimplementation. Sanitization (never leak
 * the reservation floor to the client) happens in customer-offer.ts, shared
 * with the machine-facing /api/quote route so both callers get the same guarantee.
 *
 * On ACCEPT this also creates the server-authoritative job record — the
 * same one /api/quote's raw HTTP route creates for a machine caller — so
 * the browser's counteroffer path and the machine API path both hand back
 * a jobId whose price /api/jobs/authorize will actually charge. Without
 * this, the wallet-authorized flow would have no accepted price to enforce
 * for a counteroffer accepted through the UI specifically.
 */
export async function submitCounteroffer(offer: number, planId: PlanId): Promise<CustomerOfferResult> {
  if (!Number.isFinite(offer) || offer < 0) {
    return { decision: "DECLINE", offer: 0, rationale: "Enter a valid positive dollar amount." };
  }
  const result = evaluateOfferForCustomer(offer, LOCKED_QUOTE);
  if (result.decision === "ACCEPT") {
    const job = createJob(planId, result.offer);
    return { ...result, jobId: job.jobId };
  }
  return result;
}

/**
 * Accepting a plan at its quoted price, with no counteroffer — the other
 * way a customer can reach an accepted contract. Same job-store call as the
 * accepted-offer branch above, just skipping straight to the plan's own price.
 */
export async function acceptPlan(planId: PlanId): Promise<{ jobId: string; acceptedPrice: number }> {
  const plan = buildPlans().find((p) => p.id === planId);
  if (!plan) throw new Error(`unknown plan: ${planId}`);
  const job = createJob(planId, plan.price);
  return { jobId: job.jobId, acceptedPrice: job.acceptedPrice };
}
