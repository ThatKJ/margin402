import { createLedger, recordAttempt, executionCost, realizedMargin, isVerified, type Ledger } from "@/lib/economics/ledger";
import { decideNextStep } from "@/lib/economics/engine";
import { verify } from "@/lib/sandbox";
import type { TestFailure } from "@/lib/sandbox/types";
import { isStrategyId, type StrategyId } from "@/lib/providers/strategies";
import { priceForRound } from "@/lib/providers/price-curve";
import { availableStrategiesForPlan } from "./plan-policy";
import { PARSE_DURATION_TESTS, PARSE_DURATION_PROBLEM, HIDDEN_TEST_NAMES } from "@/lib/workloads/parse-duration";
import type { Strategy } from "@/lib/economics/types";
import type { VerifyResult } from "@/lib/sandbox/types";
import type { JobEvent, JobOutcome, PlanId, RunJobArgs, RunJobResult } from "./types";

/** Safety net against a misconfigured strategy set looping forever — never hit by the canonical scenario (4 rounds). */
const MAX_ROUNDS = 20;

/**
 * Strips hidden-test failures out before this ever becomes `previousFailures`
 * for the next provider call. Repair-style strategies get fed real failing
 * tests so they can actually fix them — but only the visible ones. In live
 * mode `previousFailures` flows straight into the prompt sent to an external
 * model call, so a hidden test's name and reason must never reach this list,
 * on either the demo's own routes or someone else's provider.
 */
function visibleFailuresOnly(result: VerifyResult): TestFailure[] {
  return result.failures.filter((f) => !HIDDEN_TEST_NAMES.has(f.name));
}

/**
 * Splits the real verify() result into visible/hidden counts, using only
 * data verify() already returns (per-failure test names) — the sandbox
 * itself has no notion of visible/hidden, this is purely how the orchestrator
 * reports an existing result. Names never leave this function.
 */
function visibleHiddenCounts(result: VerifyResult): {
  visiblePassed: number;
  visibleTotal: number;
  hiddenPassed: number;
  hiddenTotal: number;
} {
  const hiddenTotal = HIDDEN_TEST_NAMES.size;
  const visibleTotal = PARSE_DURATION_TESTS.length - hiddenTotal;
  const failedHidden = result.failures.filter((f) => HIDDEN_TEST_NAMES.has(f.name)).length;
  const failedVisible = result.failures.length - failedHidden;
  return {
    visiblePassed: visibleTotal - failedVisible,
    visibleTotal,
    hiddenPassed: hiddenTotal - failedHidden,
    hiddenTotal,
  };
}

function closedEvent(
  outcome: JobOutcome,
  ledger: Ledger,
  settlements: { strategyId: StrategyId; txId: string }[],
  finalCode?: string,
): JobEvent {
  return {
    type: "closed",
    outcome,
    revenue: ledger.revenue,
    executionCost: executionCost(ledger),
    margin: realizedMargin(ledger),
    finalCode,
    settlements,
  };
}

/**
 * The orchestration state machine. Every economic decision comes from
 * lib/economics — this file never re-implements selection, affordability,
 * or the honouring rule, only sequences: decide -> pay -> verify -> record -> repeat.
 *
 * The planId parameter selects the orchestration ladder (see plan-policy.ts):
 * - "lowest-cost": one tier active at a time, cheapest-first [s1 -> s2 -> s3]
 * - "best-value": every strategy with attempts left stays available; the engine
 *   ranks by expected cost-to-success (canonical behaviour)
 * - "highest-confidence": reliability-first [s3 -> s2 -> s1]
 */
export async function runJob(args: RunJobArgs): Promise<RunJobResult> {
  let ledger = createLedger(args.revenue);
  const events: JobEvent[] = [];
  const push = (event: JobEvent) => {
    events.push(event);
    args.onEvent?.(event);
  };
  let lastFailures: TestFailure[] | undefined;
  let lastCode: string | undefined;
  let round = 0;
  const settlements: { strategyId: StrategyId; txId: string }[] = [];

  const planId: PlanId = args.planId ?? "best-value";

  while (round < MAX_ROUNDS) {
    if (args.signal?.aborted) {
      return { outcome: "FAILED", ledger, events, error: "aborted: client disconnected" };
    }
    round += 1;

    const attemptsPerStrategy: Record<string, number> = {};
    for (const a of ledger.attempts) {
      attemptsPerStrategy[a.strategyId] = (attemptsPerStrategy[a.strategyId] ?? 0) + 1;
    }

    const available: Strategy[] = availableStrategiesForPlan(planId, attemptsPerStrategy).map((s) => ({
      id: s.id,
      label: s.label,
      pSuccess: s.pSuccess,
      price: priceForRound(s.id, round),
    }));

    const step = decideNextStep(ledger, available);
    push({ type: "decision", round, step });

    if (step.kind !== "PAY") {
      push(closedEvent("REFUNDED", ledger, settlements));
      return { outcome: "REFUNDED", ledger, events };
    }

    const selected = step.selected!;
    if (!isStrategyId(selected.strategyId)) {
      throw new Error(`economics engine selected an unknown strategy id: ${selected.strategyId}`);
    }
    const strategyId = selected.strategyId;

    let providerResult;
    try {
      providerResult = await args.providerClient({ strategyId, round, previousFailures: lastFailures });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      push(closedEvent("FAILED", ledger, settlements));
      return { outcome: "FAILED", ledger, events, error: message };
    }

    push({
      type: "payment",
      round,
      strategyId,
      price: providerResult.price,
      txId: providerResult.txId,
      settlementMs: providerResult.settlementMs,
    });
    if (providerResult.txId) settlements.push({ strategyId, txId: providerResult.txId });

    const verifyResult = await verify(providerResult.code, PARSE_DURATION_PROBLEM.functionName, PARSE_DURATION_TESTS);
    const verified = verifyResult.passed === verifyResult.total;
    push({
      type: "verification",
      round,
      strategyId,
      passed: verifyResult.passed,
      total: verifyResult.total,
      verified,
      ...visibleHiddenCounts(verifyResult),
    });

    ledger = recordAttempt(ledger, {
      strategyId,
      price: providerResult.price,
      testsPassed: verifyResult.passed,
      testsTotal: verifyResult.total,
    });
    lastFailures = visibleFailuresOnly(verifyResult);
    lastCode = providerResult.code;

    if (isVerified(ledger)) {
      push(closedEvent("VERIFIED", ledger, settlements, lastCode));
      return { outcome: "VERIFIED", ledger, events, finalCode: lastCode };
    }
  }

  push(closedEvent("FAILED", ledger, settlements));
  return { outcome: "FAILED", ledger, events, error: `exceeded ${MAX_ROUNDS} rounds without resolving` };
}