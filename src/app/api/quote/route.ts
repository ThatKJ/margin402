import { NextRequest, NextResponse } from "next/server";
import { LOCKED_QUOTE } from "@/lib/economics/quote";
import { evaluateOfferForCustomer } from "@/lib/actions/customer-offer";
import { PARSE_DURATION_PROBLEM, PARSE_DURATION_TESTS } from "@/lib/workloads/parse-duration";
import { buildPlans, toCustomerPlan } from "@/lib/economics/plans";

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
 * The new three-plan system returns three execution plans with different
 * tradeoffs between cost, confidence, and execution strategy.
 *
 * Usage:
 *   curl -s -X POST http://localhost:3000/api/quote \
 *     -H 'Content-Type: application/json' \
 *     -d '{"task":"Implement parseDuration()"}'
 *   # -> { plans: [...], validSeconds: 60, accept: {...} }
 *
 *   curl -s -X POST http://localhost:3000/api/quote \
 *     -H 'Content-Type: application/json' \
 *     -d '{"planId": "best-value", "offer": 1.05}'
 *   # -> { decision: "ACCEPT", offer: 1.05, rationale: "...", accept: {...} }
 *
 * Then to accept and execute (real x402 payments unless
 * PROVIDER_CLIENT_MODE=inprocess), stream:
 *   curl -N "http://localhost:3000/api/jobs/execute?revenue=1.05&planId=best-value"
 */
export async function POST(request: NextRequest) {
  let body: { task?: unknown; tests?: unknown; budget?: unknown; offer?: unknown; planId?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // empty/invalid body is fine — task/tests/budget/offer/planId are all optional
  }

  const workload = {
    task: PARSE_DURATION_PROBLEM.description,
    functionSignature: PARSE_DURATION_PROBLEM.signature,
    testCount: PARSE_DURATION_TESTS.length,
    requestedTask: typeof body.task === "string" ? body.task : undefined,
  };

  const acceptEndpoint = {
    method: "GET",
    url: `${request.nextUrl.origin}/api/jobs/execute?revenue=<accepted_amount>&planId=<selected_plan>`,
    protocol: "text/event-stream",
    note: "Stream this after accepting to receive real orchestrator events (decisions, x402 payments, verification, final statement) as they happen.",
  };

  const plans = buildPlans().map(toCustomerPlan);

  if (typeof body.offer === "number") {
    const result = evaluateOfferForCustomer(body.offer, LOCKED_QUOTE);
    return NextResponse.json({ ...workload, ...result, accept: result.decision === "ACCEPT" ? acceptEndpoint : undefined });
  }

  if (typeof body.planId === "string" && !body.offer) {
    const selectedPlan = plans.find((p) => p.id === body.planId);
    if (selectedPlan) {
      return NextResponse.json({
        ...workload,
        selectedPlan,
        quote: selectedPlan.price,
        validSeconds: 60,
        counterofferEndpoint: { method: "POST", url: `${request.nextUrl.origin}/api/quote`, body: { planId: body.planId, offer: "<your_offer>" }, note: "One counteroffer only per plan." },
        accept: acceptEndpoint,
      });
    }
  }

  return NextResponse.json({
    ...workload,
    plans,
    quote: LOCKED_QUOTE.quote,
    validSeconds: 60,
    counterofferEndpoint: { method: "POST", url: `${request.nextUrl.origin}/api/quote`, body: { offer: "<your_offer>" }, note: "One counteroffer only." },
    accept: acceptEndpoint,
  });
}
