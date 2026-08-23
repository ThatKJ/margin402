import { NextRequest, NextResponse } from "next/server";
import { withX402 } from "@x402/next";
import type { HTTPRequestContext } from "@x402/core/server";
import { resourceServer } from "@/lib/x402/server";
import { getTreasurySigner } from "@/lib/x402/wallet";
import { ALGORAND_NETWORK } from "@/lib/x402/network";
import { priceForRound } from "./price-curve";
import { generateCandidate } from "./generate";
import { PARSE_DURATION_PROBLEM } from "@/lib/workloads/parse-duration";
import type { StrategyId } from "./strategies";
import type { TestFailure } from "@/lib/sandbox/types";

/**
 * Shared by both the 402 price callback and the handler — they must agree.
 * getQueryParam is optional on the general HTTPAdapter interface (not every
 * adapter implements it), so this reads the URL directly instead, which
 * every adapter must provide.
 */
function roundFromContext(context: HTTPRequestContext): number {
  const raw = new URL(context.adapter.getUrl()).searchParams.get("round");
  const round = raw ? Number(raw) : 1;
  return Number.isFinite(round) && round > 0 ? Math.floor(round) : 1;
}

function roundFromRequest(request: NextRequest): number {
  const raw = request.nextUrl.searchParams.get("round");
  const round = raw ? Number(raw) : 1;
  return Number.isFinite(round) && round > 0 ? Math.floor(round) : 1;
}

/**
 * Builds one x402-gated provider route. All three routes (draft/repair/
 * premium) are this same shape — only strategyId differs — so the x402
 * wiring lives in exactly one place instead of being copy-pasted three times.
 */
export function createProviderRoute(strategyId: StrategyId) {
  const handler = async (request: NextRequest) => {
    let previousFailures: TestFailure[] | undefined;
    if (request.method === "POST") {
      try {
        const body = (await request.json()) as { previousFailures?: TestFailure[] };
        previousFailures = body.previousFailures;
      } catch {
        previousFailures = undefined;
      }
    }

    const code = await generateCandidate({
      strategyId,
      problemDescription: PARSE_DURATION_PROBLEM.description,
      functionName: PARSE_DURATION_PROBLEM.functionName,
      previousFailures,
    });

    return NextResponse.json({ code, strategyId, round: roundFromRequest(request) });
  };

  return withX402(
    handler,
    {
      accepts: {
        scheme: "exact",
        network: ALGORAND_NETWORK,
        payTo: () => getTreasurySigner().address,
        price: (context) => `$${priceForRound(strategyId, roundFromContext(context)).toFixed(2)}`,
      },
      description: `${strategyId} candidate generation`,
    },
    resourceServer,
  );
}
