import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import type { HTTPRequestContext } from "@x402/core/server";
import { resourceServer } from "@/lib/x402/server";
import { getTreasurySigner } from "@/lib/x402/wallet";
import { ALGORAND_NETWORK } from "@/lib/x402/network";
import { getJob, markPaid } from "@/lib/state/job-store";

/**
 * The customer-facing x402 endpoint — Layer 1 of the two-sided x402 story
 * (see CLAUDE.md). A customer agent (reference client: Pera Wallet in the
 * browser, Testnet only) pays Margin402 here to authorize a job that was
 * already priced and accepted server-side by /api/quote. The price this
 * route charges is read back from that same job record — never from a
 * request parameter — so a client cannot talk itself into a cheaper
 * contract than the one it actually accepted.
 *
 * payTo is the Margin402 treasury address: for this endpoint Margin402 is
 * the SELLER, receiving the customer's payment. The same treasury later
 * spends from its own balance to pay providers (Layer 2, unchanged,
 * lib/x402/buyer.ts) — two distinct payment directions, same signer.
 *
 * Usage:
 *   curl -i "http://localhost:3000/api/jobs/authorize?jobId=<jobId>"
 *   # -> 402 with real payment requirements at job.acceptedPrice, until paid
 */
function jobIdFromUrl(url: string): string | null {
  return new URL(url).searchParams.get("jobId");
}

interface AuthorizeResponse {
  error?: string;
  jobId?: string;
  status?: string;
  acceptedPrice?: number;
}

const handler = async (request: NextRequest): Promise<NextResponse<AuthorizeResponse>> => {
  const jobId = request.nextUrl.searchParams.get("jobId");
  const job = jobId ? getJob(jobId) : undefined;
  if (!job) {
    return NextResponse.json({ error: "unknown or expired job" }, { status: 404 });
  }
  const updated = markPaid(job.jobId);
  return NextResponse.json({ jobId: updated!.jobId, status: updated!.status, acceptedPrice: updated!.acceptedPrice });
};

export const GET = withX402(
  handler,
  {
    accepts: {
      scheme: "exact",
      network: ALGORAND_NETWORK,
      payTo: () => getTreasurySigner().address,
      price: (context: HTTPRequestContext) => {
        const jobId = jobIdFromUrl(context.adapter.getUrl());
        const job = jobId ? getJob(jobId) : undefined;
        // No matching job: price a $0 requirement rather than throwing —
        // the handler's own 404 is the real, honest error for this case;
        // a thrown price callback would surface as an opaque 500 instead.
        return `$${(job?.acceptedPrice ?? 0).toFixed(2)}`;
      },
    },
    description: "Margin402 outcome contract — customer authorization",
  },
  resourceServer,
);
