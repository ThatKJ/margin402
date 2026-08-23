import { buyPaidResource } from "@/lib/x402/buyer";
import { priceForRound } from "@/lib/providers/price-curve";
import { generateCandidate } from "@/lib/providers/generate";
import { PARSE_DURATION_PROBLEM } from "@/lib/workloads/parse-duration";
import type { StrategyId } from "@/lib/providers/strategies";
import type { ProviderClient } from "./types";

const ROUTE_PATH: Record<StrategyId, string> = { s1: "draft", s2: "repair", s3: "premium" };

/**
 * The real provider client: pays over real x402 on Algorand testnet (via
 * the existing buyer.ts) and fetches the candidate over real HTTP. This is
 * what scripts/job-demo.ts uses against a running dev server and a funded
 * wallet — never used by the automated test suite (see run-job.test.ts).
 */
export function createX402ProviderClient(baseUrl: string, jobId: string): ProviderClient {
  return async ({ strategyId, round, previousFailures }) => {
    // Client and server derive price from the same pure function with the
    // same round number, so they agree without a live quote round-trip.
    const price = priceForRound(strategyId, round);
    const url = `${baseUrl}/api/providers/${ROUTE_PATH[strategyId]}?round=${round}`;

    const init: RequestInit | undefined =
      strategyId === "s2"
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ previousFailures: previousFailures ?? [] }),
          }
        : undefined;

    const result = await buyPaidResource(url, jobId, price, init);
    if (!result.ok) {
      throw new Error(`provider call to ${url} failed: HTTP ${result.status}`);
    }

    const body = result.body as { code?: string };
    if (!body.code) {
      throw new Error(`provider response from ${url} did not include candidate code`);
    }

    return { code: body.code, price, txId: result.txId, settlementMs: result.settlementMs };
  };
}

/**
 * In-process provider client: same real price curve and same real demo-mode
 * (or live-mode) candidate generation as the HTTP routes, but skips the
 * network/x402 round-trip entirely — no payment, real or simulated, ever
 * happens. Used by the orchestrator's own test suite (run-job.test.ts) and
 * available for local UI verification without spending real funds.
 * Never used by job-demo.ts or the production job-execution route, which
 * both default to createX402ProviderClient.
 *
 * INPROCESS_DELAY_MS optionally paces each call — useful only for watching
 * the Execution screen render round by round locally, where real network/
 * payment latency would normally provide that pacing. Unset in tests and in
 * every other environment, so it never affects anything but a manual run.
 */
export function createInProcessProviderClient(): ProviderClient {
  const delayMs = Number(process.env.INPROCESS_DELAY_MS ?? "0");
  return async ({ strategyId, round, previousFailures }) => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const price = priceForRound(strategyId, round);
    const code = await generateCandidate({
      strategyId,
      problemDescription: PARSE_DURATION_PROBLEM.description,
      functionName: PARSE_DURATION_PROBLEM.functionName,
      previousFailures,
    });
    return { code, price };
  };
}
