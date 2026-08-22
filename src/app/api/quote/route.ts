import { NextRequest, NextResponse } from "next/server";
import { LOCKED_QUOTE } from "@/lib/economics/quote";
import { evaluateOfferForCustomer } from "@/lib/actions/customer-offer";
import { PARSE_DURATION_PROBLEM, PARSE_DURATION_TESTS } from "@/lib/workloads/parse-duration";

/**
 * The machine-customer entry point: "a machine can request an outcome,
 * accept a quote, pay once, and receive verified completion" without a
 * human in the loop. No auth, no accounts — matches the rest of this
 * product's scope.
 *
 * This app prices exactly one workload today (parseDuration), so `task`/
 * `tests`/`budget` in the request body are accepted and echoed back for a
 * real client to sanity-check against, but don't change the quote — same
 * as the human Quote screen, which shows this same fixed workload. Nothing
 * here is invented: the quote is the same LOCKED_QUOTE constant the UI uses.
 *
 * Usage:
 *   curl -s -X POST http://localhost:3000/api/quote \
 *     -H 'Content-Type: application/json' \
 *     -d '{"task":"Implement parseDuration()"}'
 *   # -> { quote: 1.20, validSeconds: 60, accept: {...} }
 *
 *   curl -s -X POST http://localhost:3000/api/quote \
 *     -H 'Content-Type: application/json' \
 *     -d '{"offer": 1.05}'
 *   # -> { decision: "ACCEPT", offer: 1.05, rationale: "...", accept: {...} }
 *
 * Then to accept and execute (real x402 payments unless
 * PROVIDER_CLIENT_MODE=inprocess), stream:
 *   curl -N "http://localhost:3000/api/jobs/execute?revenue=1.05"
 *
 * The reservation floor is never present in this response, in any field or
 * in any rationale string — same rule as the customer-facing UI.
 */
export async function POST(request: NextRequest) {
  let body: { task?: unknown; tests?: unknown; budget?: unknown; offer?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // empty/invalid body is fine — task/tests/budget/offer are all optional
  }

  const workload = {
    task: PARSE_DURATION_PROBLEM.description,
    functionSignature: PARSE_DURATION_PROBLEM.signature,
    testCount: PARSE_DURATION_TESTS.length,
    requestedTask: typeof body.task === "string" ? body.task : undefined,
  };

  const acceptEndpoint = {
    method: "GET",
    url: `${request.nextUrl.origin}/api/jobs/execute?revenue=<accepted_amount>`,
    protocol: "text/event-stream",
    note: "Stream this after accepting to receive real orchestrator events (decisions, x402 payments, verification, final statement) as they happen.",
  };

  if (typeof body.offer === "number") {
    const result = evaluateOfferForCustomer(body.offer, LOCKED_QUOTE);
    return NextResponse.json({ ...workload, ...result, accept: result.decision === "ACCEPT" ? acceptEndpoint : undefined });
  }

  return NextResponse.json({
    ...workload,
    // Only the total — expectedCost and riskReserve are withheld because
    // together they sum to exactly the reservation floor (see quote.ts),
    // the same number the human Quote screen never shows either.
    quote: LOCKED_QUOTE.quote,
    validSeconds: 60,
    counterofferEndpoint: { method: "POST", url: `${request.nextUrl.origin}/api/quote`, body: { offer: "<your_offer>" }, note: "One counteroffer only." },
    accept: acceptEndpoint,
  });
}
