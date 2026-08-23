import { HTTPFacilitatorClient, x402ResourceServer } from "@x402/core/server";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { ALGORAND_NETWORK } from "./network";
import { markPaid } from "@/lib/state/job-store";

const facilitatorClient = new HTTPFacilitatorClient({
  url: process.env.FACILITATOR_URL ?? "https://facilitator.goplausible.xyz",
});

/**
 * Shared x402 resource server for every x402-gated route in this app
 * (provider routes and the customer authorize route both register through
 * here) — which is why the afterSettle hook below checks the resource URL
 * before touching job state, rather than assuming every settlement is a
 * customer payment.
 *
 * The hook exists so a job's recorded customerTxId is always the real,
 * facilitator-verified transaction id from `result.transaction` — never a
 * value a client claims after the fact. A browser POSTing an arbitrary
 * string to /api/jobs/authorize used to get stored verbatim once the job
 * was already PAID (the status transition was genuinely settlement-gated,
 * but the txId text itself wasn't); this closes that gap by capturing the
 * txId at the one point it's actually trustworthy — the resource server's
 * own post-settlement callback, run after the facilitator itself confirms
 * the payment, not from anything the client sends.
 */
/**
 * Picks out the jobId a settled resource URL belongs to, but only for the
 * customer authorize route — every other x402-gated route (the provider
 * endpoints) shares this same resourceServer and must never have its
 * settlements mistaken for a customer payment against job state.
 */
export function jobIdFromAuthorizeSettlement(resourceUrl: string | undefined): string | null {
  if (!resourceUrl || !resourceUrl.includes("/api/jobs/authorize")) return null;
  try {
    return new URL(resourceUrl).searchParams.get("jobId");
  } catch {
    return null;
  }
}

export const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(ALGORAND_NETWORK, new ExactAvmScheme())
  .onAfterSettle(async (context) => {
    const jobId = jobIdFromAuthorizeSettlement(context.paymentPayload.resource?.url);
    const txId = context.result.transaction;
    if (jobId && txId) await markPaid(jobId, txId);
  });
