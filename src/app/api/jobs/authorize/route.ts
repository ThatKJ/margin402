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
 * Job existence is checked HERE, before withX402 ever runs — not inside
 * the price callback. withX402's simple RouteConfig API has no supported
 * way to abort the 402 challenge itself from a price callback (a thrown
 * price fn just becomes an opaque 500, still after a payment requirement
 * may already be under construction); gating the request before it ever
 * reaches the x402-wrapped handler means an unknown/expired job gets a
 * clean 404 with no payment-required response, no wallet prompt, and no
 * $0.00 contract ever offered.
 *
 * Usage:
 *   curl -i "http://localhost:3000/api/jobs/authorize?jobId=<jobId>"
 *   # unknown job  -> 404, no payment challenge at all
 *   # known job    -> 402 with real payment requirements at job.acceptedPrice
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

const paidHandler = async (request: NextRequest): Promise<NextResponse<AuthorizeResponse>> => {
  const jobId = request.nextUrl.searchParams.get("jobId");
  // Re-checked here (not just in the outer GET gate) because this is what
  // actually runs after a real payment settles — if the job vanished in
  // the handful of milliseconds between the outer check and here, failing
  // closed is correct: better a false "job missing" than silently
  // fabricating a PAID record with nothing behind it.
  const job = jobId ? await getJob(jobId) : undefined;
  if (!job) {
    return NextResponse.json({ error: "unknown or expired job" }, { status: 404 });
  }
  const updated = await markPaid(job.jobId);
  return NextResponse.json({ jobId: updated!.jobId, status: updated!.status, acceptedPrice: updated!.acceptedPrice });
};

const x402Gated = withX402(
  paidHandler,
  {
    accepts: {
      scheme: "exact",
      network: ALGORAND_NETWORK,
      payTo: () => getTreasurySigner().address,
      price: async (context: HTTPRequestContext) => {
        const jobId = jobIdFromUrl(context.adapter.getUrl());
        const job = jobId ? await getJob(jobId) : undefined;
        // Reached only when the outer GET below already confirmed the job
        // exists; a job vanishing in this exact window is a real-but-tiny
        // race, not the normal "unknown job" case, and $0 here would still
        // never be quoted to a genuinely-unknown job — the outer 404 gate
        // already returned before this ever runs for that case.
        return `$${(job?.acceptedPrice ?? 0).toFixed(2)}`;
      },
    },
    description: "Margin402 outcome contract — customer authorization",
  },
  resourceServer,
);

export async function GET(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  const job = jobId ? await getJob(jobId) : undefined;
  if (!job) {
    return NextResponse.json({ error: "unknown or expired job" }, { status: 404 });
  }
  return x402Gated(request);
}

/**
 * Attaches the real customer settlement transaction id to an already-PAID
 * job, reported by the browser client that just completed the real x402
 * payment above (it decodes the genuine PAYMENT-RESPONSE header itself,
 * same as lib/x402/buyer.ts does server-side — see browser-buyer.ts). This
 * can only ever annotate a job that is already PAID/EXECUTING/CLOSED via
 * the real x402 flow above; it cannot mark anything paid on its own, so it
 * carries no authority over money — only over receipt metadata.
 */
export async function POST(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  let body: { txId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const job = jobId ? await getJob(jobId) : undefined;
  if (!job) {
    return NextResponse.json({ error: "unknown or expired job" }, { status: 404 });
  }
  if (job.status === "ACCEPTED") {
    return NextResponse.json({ error: "job has not been paid yet" }, { status: 409 });
  }
  if (typeof body.txId === "string" && body.txId) {
    await markPaid(job.jobId, body.txId);
  }
  return NextResponse.json({ jobId: job.jobId, status: job.status });
}
